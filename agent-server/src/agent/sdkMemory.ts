import * as os from 'node:os'
import * as path from 'node:path'
import { promises as fs } from 'node:fs'
import type { Stats } from 'node:fs'
import type {
  SdkMemoryAgentDTO,
  SdkMemoryFileDTO,
  SdkMemoryListDTO,
  SdkMemoryReadDTO,
  SdkMemoryRootDTO,
  SdkMemoryScope,
} from '../shared/types.ts'

export class SdkMemoryError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

type SdkMemorySettings = {
  autoMemoryDirectory?: string
}

type RootSpec = {
  scope: SdkMemoryScope
  label: string
  rootPath: string
  agentScoped: boolean
}

export type SdkMemoryFileTargetInput = {
  scope: unknown
  agentName?: unknown
  relativePath?: unknown
}

const MAX_FILE_BYTES = 256 * 1024
const MAX_LISTED_FILES = 500

function projectRoot(): string {
  return process.env.AGENT_SCAFFOLD_ROOT ?? process.cwd()
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir()
  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

export function resolveAutoMemoryDirectory(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const expanded = expandHome(trimmed)
  return path.resolve(path.isAbsolute(expanded) ? expanded : path.join(projectRoot(), expanded))
}

function rootSpecs(settings: SdkMemorySettings = {}): RootSpec[] {
  const specs: RootSpec[] = [
    {
      scope: 'user',
      label: 'User agent memory',
      rootPath: path.join(os.homedir(), '.claude', 'agent-memory'),
      agentScoped: true,
    },
    {
      scope: 'project',
      label: 'Project agent memory',
      rootPath: path.join(projectRoot(), '.claude', 'agent-memory'),
      agentScoped: true,
    },
    {
      scope: 'local',
      label: 'Local agent memory',
      rootPath: path.join(projectRoot(), '.claude', 'agent-memory-local'),
      agentScoped: true,
    },
  ]

  const autoRoot = resolveAutoMemoryDirectory(settings.autoMemoryDirectory)
  if (autoRoot) {
    specs.push({
      scope: 'auto',
      label: 'Auto memory',
      rootPath: autoRoot,
      agentScoped: false,
    })
  }

  return specs
}

function normalizeScope(value: unknown): SdkMemoryScope {
  if (value === 'user' || value === 'project' || value === 'local' || value === 'auto') return value
  throw new SdkMemoryError('invalid_scope', 'Invalid SDK memory scope.')
}

function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..'
}

function normalizeAgentName(value: unknown, spec: RootSpec): string | undefined {
  if (!spec.agentScoped) return undefined
  if (typeof value !== 'string' || !isSafeSegment(value)) {
    throw new SdkMemoryError('invalid_agent_name', 'Invalid SDK memory agent name.')
  }
  return value
}

function normalizeRelativePath(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SdkMemoryError('invalid_path', 'Invalid SDK memory file path.')
  }
  const trimmed = value.trim()
  if (!trimmed || path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    throw new SdkMemoryError('invalid_path', 'Invalid SDK memory file path.')
  }

  const parts = trimmed
    .split(/[\\/]+/g)
    .filter(Boolean)

  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new SdkMemoryError('invalid_path', 'Invalid SDK memory file path.')
  }
  if (parts.some((part) => !isSafeSegment(part))) {
    throw new SdkMemoryError('invalid_path', 'Invalid SDK memory file path.')
  }

  return parts.join('/')
}

function assertWithinRoot(root: string, target: string): void {
  const relative = path.relative(root, target)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return
  throw new SdkMemoryError('path_outside_root', 'SDK memory file path escapes the memory root.')
}

function assertRealpathWithinRoot(root: string, target: string): void {
  const relative = path.relative(root, target)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return
  throw new SdkMemoryError('path_outside_root', 'SDK memory file path escapes the memory root.')
}

function assertNotSymlink(filePath: string, stat: Stats): void {
  if (!stat.isSymbolicLink()) return
  throw new SdkMemoryError('symlink_not_allowed', `SDK memory path is a symlink: ${filePath}`)
}

function specByScope(scope: SdkMemoryScope, settings: SdkMemorySettings): RootSpec {
  const spec = rootSpecs(settings).find((candidate) => candidate.scope === scope)
  if (!spec) throw new SdkMemoryError('unknown_root', 'SDK memory root is not configured.')
  return spec
}

async function lstatIfExists(filePath: string): Promise<Stats | null> {
  try {
    return await fs.lstat(filePath)
  } catch {
    return null
  }
}

function lineagePaths(rootPath: string, targetPath: string, includeTarget: boolean): string[] {
  const root = path.resolve(rootPath)
  const target = path.resolve(targetPath)
  assertWithinRoot(root, target)
  const relative = path.relative(root, target)
  const parts = relative ? relative.split(path.sep).filter(Boolean) : []
  const limit = includeTarget ? parts.length : Math.max(0, parts.length - 1)
  const paths = [root]
  let cursor = root
  for (let i = 0; i < limit; i += 1) {
    cursor = path.join(cursor, parts[i])
    paths.push(cursor)
  }
  return paths
}

async function validateExistingLineage(
  rootPath: string,
  targetPath: string,
  includeTarget: boolean,
): Promise<void> {
  let rootReal: string | null = null
  for (const current of lineagePaths(rootPath, targetPath, includeTarget)) {
    const stat = await lstatIfExists(current)
    if (!stat) break
    assertNotSymlink(current, stat)
    const currentReal = await fs.realpath(current)
    if (!rootReal) {
      rootReal = currentReal
      continue
    }
    assertRealpathWithinRoot(rootReal, currentReal)
  }
}

async function safeDirectoryInfo(dir: string): Promise<{ exists: boolean; usable: boolean; realPath?: string }> {
  const stat = await lstatIfExists(dir)
  if (!stat) return { exists: false, usable: false }
  assertNotSymlink(dir, stat)
  if (!stat.isDirectory()) return { exists: true, usable: false }
  return { exists: true, usable: true, realPath: await fs.realpath(dir) }
}

async function listFiles(scope: SdkMemoryScope, root: string, agentName?: string): Promise<SdkMemoryFileDTO[]> {
  const rootInfo = await safeDirectoryInfo(root)
  if (!rootInfo.usable || !rootInfo.realPath) return []
  const rootRealPath = rootInfo.realPath

  const files: SdkMemoryFileDTO[] = []
  async function visit(dir: string, prefix = ''): Promise<void> {
    if (files.length >= MAX_LISTED_FILES) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (files.length >= MAX_LISTED_FILES) return
      const entryPath = path.join(dir, entry.name)
      const entryStat = await lstatIfExists(entryPath)
      if (!entryStat) continue
      if (entryStat.isSymbolicLink()) continue
      assertRealpathWithinRoot(rootRealPath, await fs.realpath(entryPath))

      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entryStat.isDirectory()) {
        if (isSafeSegment(entry.name)) await visit(entryPath, relativePath)
        continue
      }
      if (!entryStat.isFile()) continue
      files.push({
        scope,
        agentName,
        relativePath,
        name: entry.name,
        size: entryStat.size,
        updatedAt: entryStat.mtime.toISOString(),
      })
    }
  }

  await visit(root)
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

async function listAgentMemoryRoot(spec: RootSpec): Promise<SdkMemoryRootDTO> {
  const rootInfo = await safeDirectoryInfo(spec.rootPath)
  const agents: SdkMemoryAgentDTO[] = []
  if (rootInfo.usable) {
    const entries = await fs.readdir(spec.rootPath, { withFileTypes: true })
    for (const entry of entries) {
      const agentPath = path.join(spec.rootPath, entry.name)
      const agentStat = await lstatIfExists(agentPath)
      if (!agentStat || agentStat.isSymbolicLink() || !agentStat.isDirectory() || !isSafeSegment(entry.name)) {
        continue
      }
      if (rootInfo.realPath) assertRealpathWithinRoot(rootInfo.realPath, await fs.realpath(agentPath))
      agents.push({
        agentName: entry.name,
        files: await listFiles(spec.scope, agentPath, entry.name),
      })
    }
  }

  return {
    scope: spec.scope,
    label: spec.label,
    path: spec.rootPath,
    exists: rootInfo.exists,
    agents: agents.sort((a, b) => a.agentName.localeCompare(b.agentName)),
    files: [],
  }
}

async function listFlatMemoryRoot(spec: RootSpec): Promise<SdkMemoryRootDTO> {
  const rootInfo = await safeDirectoryInfo(spec.rootPath)
  return {
    scope: spec.scope,
    label: spec.label,
    path: spec.rootPath,
    exists: rootInfo.exists,
    agents: [],
    files: await listFiles(spec.scope, spec.rootPath),
  }
}

export async function listSdkMemory(settings: SdkMemorySettings = {}): Promise<SdkMemoryListDTO> {
  const roots: SdkMemoryRootDTO[] = []
  for (const spec of rootSpecs(settings)) {
    roots.push(spec.agentScoped ? await listAgentMemoryRoot(spec) : await listFlatMemoryRoot(spec))
  }
  return { roots }
}

export function resolveSdkMemoryFileTarget(
  input: SdkMemoryFileTargetInput,
  settings: SdkMemorySettings = {},
): {
  scope: SdkMemoryScope
  agentName?: string
  relativePath: string
  rootPath: string
  filePath: string
} {
  const scope = normalizeScope(input.scope)
  const spec = specByScope(scope, settings)
  const agentName = normalizeAgentName(input.agentName, spec)
  const relativePath = normalizeRelativePath(input.relativePath)
  const rootPath = agentName ? path.join(spec.rootPath, agentName) : spec.rootPath
  const filePath = path.resolve(rootPath, ...relativePath.split('/'))
  assertWithinRoot(rootPath, filePath)
  return { scope, agentName, relativePath, rootPath, filePath }
}

export async function readSdkMemoryFile(
  input: SdkMemoryFileTargetInput,
  settings: SdkMemorySettings = {},
): Promise<SdkMemoryReadDTO> {
  const target = resolveSdkMemoryFileTarget(input, settings)
  await validateExistingLineage(target.rootPath, target.filePath, true)
  const stat = await lstatIfExists(target.filePath)
  if (!stat?.isFile()) throw new SdkMemoryError('not_found', 'SDK memory file not found.')
  if (stat.size > MAX_FILE_BYTES) throw new SdkMemoryError('file_too_large', 'SDK memory file is too large.')
  return {
    scope: target.scope,
    agentName: target.agentName,
    relativePath: target.relativePath,
    content: await fs.readFile(target.filePath, 'utf8'),
    updatedAt: stat.mtime.toISOString(),
  }
}

export async function writeSdkMemoryFile(
  input: SdkMemoryFileTargetInput & { content: unknown },
  settings: SdkMemorySettings = {},
): Promise<SdkMemoryReadDTO> {
  if (typeof input.content !== 'string') {
    throw new SdkMemoryError('invalid_content', 'SDK memory file content must be a string.')
  }
  if (Buffer.byteLength(input.content, 'utf8') > MAX_FILE_BYTES) {
    throw new SdkMemoryError('file_too_large', 'SDK memory file is too large.')
  }
  const target = resolveSdkMemoryFileTarget(input, settings)
  await validateExistingLineage(target.rootPath, target.filePath, false)
  await fs.mkdir(path.dirname(target.filePath), { recursive: true })
  await validateExistingLineage(target.rootPath, target.filePath, false)
  const existingTarget = await lstatIfExists(target.filePath)
  if (existingTarget?.isSymbolicLink()) {
    throw new SdkMemoryError('symlink_not_allowed', `SDK memory path is a symlink: ${target.filePath}`)
  }
  if (existingTarget && !existingTarget.isFile()) {
    throw new SdkMemoryError('invalid_path', 'Invalid SDK memory file path.')
  }
  await fs.writeFile(target.filePath, input.content, 'utf8')
  return readSdkMemoryFile(input, settings)
}

export async function deleteSdkMemoryFile(
  input: SdkMemoryFileTargetInput,
  settings: SdkMemorySettings = {},
): Promise<void> {
  const target = resolveSdkMemoryFileTarget(input, settings)
  await validateExistingLineage(target.rootPath, target.filePath, true)
  await fs.rm(target.filePath, { force: true })
}
