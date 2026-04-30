export type GitHubRepositoryRef = {
  owner: string
  repo: string
  url: string
}

export type GitHubTreeEntry = {
  path: string
  type: 'file' | 'dir' | 'submodule'
  sha?: string
  size?: number
  language?: string
}

export type SelectableGitHubTreeEntry = GitHubTreeEntry & {
  name: string
  parentPath: string
  selectedDefault: boolean
  skipped: boolean
  skipReason?: string
}

export type GitHubSkip = {
  path: string
  reason: string
}

export type GitHubLimits = {
  maxTreeEntries: number
  maxSelectedFiles: number
  maxRepositoryBytes: number
  maxFileBytes: number
  maxTotalTextBytes: number
  maxChunks: number
  maxContextChars: number
  chunkChars: number
  chunkOverlap: number
}

export class GitHubContextError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'GitHubContextError'
    this.code = code
    this.status = status
  }
}

function limitNumber(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

export const GITHUB_LIMITS: GitHubLimits = {
  maxTreeEntries: limitNumber('GITHUB_MAX_TREE_ENTRIES', 5_000),
  maxSelectedFiles: limitNumber('GITHUB_MAX_SELECTED_FILES', 200),
  maxRepositoryBytes: limitNumber('GITHUB_MAX_REPOSITORY_BYTES', 25_000_000),
  maxFileBytes: limitNumber('GITHUB_MAX_FILE_BYTES', 256_000),
  maxTotalTextBytes: limitNumber('GITHUB_MAX_TOTAL_TEXT_BYTES', 1_200_000),
  maxChunks: limitNumber('GITHUB_MAX_CHUNKS', 800),
  maxContextChars: limitNumber('GITHUB_MAX_CONTEXT_CHARS', 24_000),
  chunkChars: limitNumber('GITHUB_CHUNK_CHARS', 4_000),
  chunkOverlap: limitNumber('GITHUB_CHUNK_OVERLAP', 400),
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/

const SKIPPED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.venv',
  'venv',
  'vendor',
  'coverage',
  '.cache',
  '.turbo',
  '.parcel-cache',
  'target',
  '__pycache__',
])

const LOCKFILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'composer.lock',
  'poetry.lock',
  'pipfile.lock',
  'gemfile.lock',
  'cargo.lock',
])

const GENERATED_SUFFIXES = [
  '.min.js',
  '.min.css',
  '.bundle.js',
  '.bundle.css',
  '.map',
  '.generated.ts',
  '.generated.tsx',
  '.generated.js',
  '.pb.go',
  '.g.dart',
]

const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.a',
  '.avi',
  '.avif',
  '.bin',
  '.bmp',
  '.bz2',
  '.class',
  '.dll',
  '.dmg',
  '.doc',
  '.docx',
  '.eot',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.lockb',
  '.mov',
  '.mp3',
  '.mp4',
  '.o',
  '.otf',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.rar',
  '.so',
  '.tar',
  '.tgz',
  '.ttf',
  '.wasm',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.xls',
  '.xlsx',
  '.zip',
])

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  ['.c', 'C'],
  ['.cc', 'C++'],
  ['.cpp', 'C++'],
  ['.cs', 'C#'],
  ['.css', 'CSS'],
  ['.go', 'Go'],
  ['.h', 'C/C++ Header'],
  ['.html', 'HTML'],
  ['.java', 'Java'],
  ['.js', 'JavaScript'],
  ['.jsx', 'JavaScript React'],
  ['.json', 'JSON'],
  ['.kt', 'Kotlin'],
  ['.md', 'Markdown'],
  ['.mdx', 'MDX'],
  ['.php', 'PHP'],
  ['.py', 'Python'],
  ['.rb', 'Ruby'],
  ['.rs', 'Rust'],
  ['.scss', 'SCSS'],
  ['.sh', 'Shell'],
  ['.sql', 'SQL'],
  ['.svelte', 'Svelte'],
  ['.swift', 'Swift'],
  ['.toml', 'TOML'],
  ['.ts', 'TypeScript'],
  ['.tsx', 'TypeScript React'],
  ['.txt', 'Text'],
  ['.vue', 'Vue'],
  ['.xml', 'XML'],
  ['.yaml', 'YAML'],
  ['.yml', 'YAML'],
])

const LANGUAGE_BY_NAME = new Map<string, string>([
  ['dockerfile', 'Dockerfile'],
  ['makefile', 'Makefile'],
  ['readme', 'Markdown'],
  ['license', 'Text'],
  ['gemfile', 'Ruby'],
  ['rakefile', 'Ruby'],
])

const SENSITIVE_NAME_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /(?:^|[._-])secret(?:s)?(?:[._-]|$)/i,
  /(?:^|[._-])credential(?:s)?(?:[._-]|$)/i,
  /(?:^|[._-])private[-_.]?key(?:[._-]|$)/i,
  /(?:^|[._-])id_rsa(?:[._-]|$)/i,
  /(?:^|[._-])id_dsa(?:[._-]|$)/i,
  /(?:^|[._-])id_ed25519(?:[._-]|$)/i,
  /\.(?:pem|p12|pfx|key|crt|cer)$/i,
]

const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[^'"\s]{16,}/i,
]

function cleanRepoName(repo: string): string {
  return repo.endsWith('.git') ? repo.slice(0, -4) : repo
}

function canonicalRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`
}

function assertOwnerRepo(owner: string, repo: string): void {
  if (!OWNER_RE.test(owner)) throw new GitHubContextError('invalid_owner', 'Invalid GitHub owner.')
  if (!REPO_RE.test(repo) || repo === '.' || repo === '..') {
    throw new GitHubContextError('invalid_repo', 'Invalid GitHub repository name.')
  }
}

export function parseGitHubRepositoryUrl(input: string): GitHubRepositoryRef {
  const raw = input.trim()
  if (!raw) throw new GitHubContextError('invalid_url', 'Enter a GitHub repository URL.')

  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]+(?:\.git)?$/.test(raw)) {
    const [owner, rawRepo] = raw.split('/')
    const repo = cleanRepoName(rawRepo)
    assertOwnerRepo(owner, repo)
    return { owner, repo, url: canonicalRepoUrl(owner, repo) }
  }

  let url: URL
  try {
    url = new URL(raw.startsWith('github.com/') ? `https://${raw}` : raw)
  } catch {
    throw new GitHubContextError('invalid_url', 'Enter a valid GitHub repository URL.')
  }

  if (url.protocol !== 'https:') {
    throw new GitHubContextError('unsupported_url', 'Only https://github.com repository URLs are supported.')
  }
  if (url.hostname.toLowerCase() !== 'github.com') {
    throw new GitHubContextError('unsupported_host', 'Only github.com repositories are supported in this version.')
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) {
    throw new GitHubContextError('invalid_url', 'GitHub URL must include owner and repository.')
  }

  const owner = parts[0]
  const repo = cleanRepoName(parts[1])
  assertOwnerRepo(owner, repo)
  return { owner, repo, url: canonicalRepoUrl(owner, repo) }
}

export function validateGitHubRef(ref: string | undefined): string | undefined {
  const trimmed = ref?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 200) throw new GitHubContextError('invalid_ref', 'Git ref is too long.')
  if (/[\u0000-\u001f\u007f\\~^:?*[ \]]/.test(trimmed)) {
    throw new GitHubContextError('invalid_ref', 'Git ref contains unsupported characters.')
  }
  if (
    trimmed.includes('..')
    || trimmed.includes('//')
    || trimmed.includes('@{')
    || trimmed.startsWith('/')
    || trimmed.endsWith('/')
    || trimmed.endsWith('.')
    || trimmed.endsWith('.lock')
  ) {
    throw new GitHubContextError('invalid_ref', 'Git ref is not safe to use.')
  }
  return trimmed
}

export function validateRepoPath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, '')
  if (!normalized) throw new GitHubContextError('invalid_path', 'Path cannot be empty.')
  if (normalized.length > 1_000) throw new GitHubContextError('invalid_path', 'Path is too long.')
  if (/[\u0000-\u001f\u007f\\]/.test(normalized)) {
    throw new GitHubContextError('invalid_path', 'Path contains unsupported characters.')
  }
  if (normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new GitHubContextError('invalid_path', 'Path is not safe to use.')
  }
  return normalized
}

function safePathOrNull(path: string): string | null {
  try {
    return validateRepoPath(path)
  } catch {
    return null
  }
}

function fileExtension(path: string): string {
  const name = path.split('/').pop() ?? ''
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index).toLowerCase() : ''
}

export function inferLanguage(path: string): string | undefined {
  const name = (path.split('/').pop() ?? '').toLowerCase()
  const withoutExtension = name.replace(/\.[^.]+$/, '')
  return LANGUAGE_BY_EXTENSION.get(fileExtension(path)) ?? LANGUAGE_BY_NAME.get(name) ?? LANGUAGE_BY_NAME.get(withoutExtension)
}

export function skipReasonForEntry(
  entry: Pick<GitHubTreeEntry, 'path' | 'type' | 'size'>,
  limits: Pick<GitHubLimits, 'maxFileBytes'> = GITHUB_LIMITS,
): string | null {
  const safePath = safePathOrNull(entry.path)
  if (!safePath) return 'invalid path'
  if (entry.type !== 'file') return entry.type === 'submodule' ? 'submodule' : null

  const parts = safePath.split('/')
  if (parts.some((part) => SKIPPED_DIRS.has(part.toLowerCase()))) return 'excluded directory'

  const basename = parts[parts.length - 1] ?? ''
  const lowerName = basename.toLowerCase()
  if (SENSITIVE_NAME_PATTERNS.some((pattern) => pattern.test(lowerName))) return 'sensitive path'
  if (LOCKFILE_NAMES.has(lowerName)) return 'lockfile'
  if (GENERATED_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) return 'generated file'
  if (BINARY_EXTENSIONS.has(fileExtension(lowerName))) return 'binary or media file'
  if (typeof entry.size === 'number' && entry.size > limits.maxFileBytes) return 'file too large'
  return null
}

export function toSelectableEntries(entries: GitHubTreeEntry[]): SelectableGitHubTreeEntry[] {
  return entries
    .map((entry) => {
      const parts = entry.path.split('/')
      const name = parts[parts.length - 1] ?? entry.path
      const parentPath = parts.slice(0, -1).join('/')
      const skipReason = skipReasonForEntry(entry)
      return {
        ...entry,
        name,
        parentPath,
        language: entry.language ?? inferLanguage(entry.path),
        skipped: Boolean(skipReason),
        skipReason: skipReason ?? undefined,
        selectedDefault: entry.type === 'file' && !skipReason,
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.path.localeCompare(b.path)
    })
}

export function expandSelectedFiles(
  entries: SelectableGitHubTreeEntry[],
  selectedPaths: string[],
  limits: Pick<GitHubLimits, 'maxSelectedFiles' | 'maxRepositoryBytes'> = GITHUB_LIMITS,
): { files: SelectableGitHubTreeEntry[]; skipped: GitHubSkip[] } {
  const sanitizedSelections = selectedPaths.map(validateRepoPath)
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]))
  const skipped: GitHubSkip[] = []
  const files = new Map<string, SelectableGitHubTreeEntry>()

  for (const selectedPath of sanitizedSelections) {
    const selected = entryByPath.get(selectedPath)
    if (!selected) {
      skipped.push({ path: selectedPath, reason: 'not found in tree' })
      continue
    }

    const candidates = selected.type === 'dir'
      ? entries.filter((entry) => entry.type === 'file' && entry.path.startsWith(`${selectedPath}/`))
      : [selected]

    for (const candidate of candidates) {
      if (candidate.type !== 'file') continue
      if (candidate.skipped) {
        skipped.push({ path: candidate.path, reason: candidate.skipReason ?? 'skipped by filter' })
        continue
      }
      files.set(candidate.path, candidate)
    }
  }

  let totalBytes = 0
  const limited: SelectableGitHubTreeEntry[] = []
  for (const file of [...files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (limited.length >= limits.maxSelectedFiles) {
      skipped.push({ path: file.path, reason: 'selected file limit reached' })
      continue
    }
    const size = file.size ?? 0
    if (totalBytes + size > limits.maxRepositoryBytes) {
      skipped.push({ path: file.path, reason: 'repository byte limit reached' })
      continue
    }
    totalBytes += size
    limited.push(file)
  }

  return { files: limited, skipped }
}

export function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192))
  if (sample.includes(0)) return true
  if (sample.length === 0) return false

  let suspicious = 0
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1
  }
  return suspicious / sample.length > 0.08
}

export function decodeTextBuffer(buffer: Buffer): string | null {
  if (looksBinary(buffer)) return null
  const text = buffer.toString('utf8')
  if (!text.trim()) return null
  const replacements = (text.match(/\uFFFD/g) ?? []).length
  if (replacements > Math.max(8, text.length * 0.01)) return null
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function containsLikelySecret(text: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(text))
}

function trimChunk(value: string): string {
  return value.replace(/^\n+|\n+$/g, '')
}

export function chunkText(
  text: string,
  limits: Pick<GitHubLimits, 'chunkChars' | 'chunkOverlap'> = GITHUB_LIMITS,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (normalized.trim().length === 0) return []
  if (normalized.length <= limits.chunkChars) return [trimChunk(normalized)]

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    const hardEnd = Math.min(normalized.length, start + limits.chunkChars)
    let end = hardEnd
    const newline = normalized.lastIndexOf('\n', hardEnd)
    if (newline > start + Math.floor(limits.chunkChars * 0.45)) end = newline

    const chunk = trimChunk(normalized.slice(start, end))
    if (chunk) chunks.push(chunk)
    if (end >= normalized.length) break

    const nextStart = Math.max(end - limits.chunkOverlap, start + 1)
    const nextNewline = normalized.indexOf('\n', nextStart)
    start = nextNewline > nextStart && nextNewline < end ? nextNewline + 1 : nextStart
  }

  return chunks
}

