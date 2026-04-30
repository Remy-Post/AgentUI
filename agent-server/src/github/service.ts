import { Octokit } from '@octokit/rest'
import mongoose from 'mongoose'
import { GitHubRepositoryChunk } from '../db/models/GitHubRepositoryChunk.ts'
import { GitHubRepositorySource } from '../db/models/GitHubRepositorySource.ts'
import { getGitHubToken } from './auth.ts'
import {
  GITHUB_LIMITS,
  GitHubContextError,
  chunkText,
  containsLikelySecret,
  decodeTextBuffer,
  expandSelectedFiles,
  inferLanguage,
  parseGitHubRepositoryUrl,
  toSelectableEntries,
  validateGitHubRef,
  type GitHubLimits,
  type GitHubSkip,
  type GitHubTreeEntry,
  type SelectableGitHubTreeEntry,
} from './core.ts'

type GitHubRepoResponse = {
  name: string
  full_name: string
  html_url: string
  default_branch: string
  private: boolean
}

type GitHubCommitResponse = {
  sha: string
  commit: {
    tree: {
      sha: string
    }
  }
}

type GitHubTreeResponse = {
  sha: string
  truncated: boolean
  tree: Array<{
    path?: string
    type?: 'blob' | 'tree' | 'commit'
    sha?: string
    size?: number
  }>
}

type GitHubBlobResponse = {
  content: string
  encoding: string
  size: number
  sha: string
}

export type GitHubRepositoryMetadata = {
  owner: string
  repo: string
  fullName: string
  repoUrl: string
  defaultBranch: string
  ref: string
  commitSha: string
  treeSha: string
  private: boolean
  treeTruncated: boolean
}

export type GitHubPreviewResult = {
  repository: GitHubRepositoryMetadata
  entries: SelectableGitHubTreeEntry[]
  defaultSelectedPaths: string[]
  skippedCount: number
  limits: GitHubLimits
}

export type GitHubIngestResult = {
  sourceId: string
  repository: GitHubRepositoryMetadata
  selectedFileCount: number
  ingestedFileCount: number
  chunkCount: number
  skipped: GitHubSkip[]
  errors: Array<{ path: string; message: string }>
  limits: GitHubLimits
}

function octokit(): Octokit {
  return new Octokit({
    auth: getGitHubToken(),
    userAgent: 'AgentUI GitHub Context MVP',
  })
}

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number') return status
  }
  return undefined
}

function normalizeGitHubError(error: unknown): GitHubContextError {
  if (error instanceof GitHubContextError) return error
  const status = errorStatus(error)
  if (status === 401 || status === 403) {
    return new GitHubContextError('github_auth_failed', 'GitHub token is missing or does not have read access.', status)
  }
  if (status === 404) {
    return new GitHubContextError('github_not_found', 'Repository was not found or requires a GitHub token.', 404)
  }
  if (status === 409) {
    return new GitHubContextError('github_empty_or_conflict', 'Repository is empty or unavailable.', 409)
  }
  const message = error instanceof Error ? error.message : 'GitHub request failed.'
  return new GitHubContextError('github_request_failed', message, 502)
}

async function requestRepo(owner: string, repo: string): Promise<GitHubRepoResponse> {
  try {
    const response = await octokit().request('GET /repos/{owner}/{repo}', {
      owner,
      repo,
    })
    return response.data as GitHubRepoResponse
  } catch (error) {
    throw normalizeGitHubError(error)
  }
}

async function requestCommit(owner: string, repo: string, ref: string): Promise<GitHubCommitResponse> {
  try {
    const response = await octokit().request('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner,
      repo,
      ref,
    })
    return response.data as GitHubCommitResponse
  } catch (error) {
    throw normalizeGitHubError(error)
  }
}

async function requestTree(owner: string, repo: string, treeSha: string): Promise<GitHubTreeResponse> {
  try {
    const response = await octokit().request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
      owner,
      repo,
      tree_sha: treeSha,
      recursive: '1',
    })
    return response.data as GitHubTreeResponse
  } catch (error) {
    throw normalizeGitHubError(error)
  }
}

async function requestBlob(owner: string, repo: string, fileSha: string): Promise<Buffer> {
  try {
    const response = await octokit().request('GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
      owner,
      repo,
      file_sha: fileSha,
    })
    const data = response.data as GitHubBlobResponse
    if (data.encoding !== 'base64') {
      throw new GitHubContextError('unsupported_blob_encoding', 'Unsupported GitHub blob encoding.', 422)
    }
    return Buffer.from(data.content.replace(/\s+/g, ''), 'base64')
  } catch (error) {
    throw normalizeGitHubError(error)
  }
}

function toTreeEntry(item: GitHubTreeResponse['tree'][number]): GitHubTreeEntry | null {
  if (!item.path || !item.type) return null
  if (item.type === 'tree') {
    return { path: item.path, type: 'dir', sha: item.sha }
  }
  if (item.type === 'commit') {
    return { path: item.path, type: 'submodule', sha: item.sha }
  }
  return {
    path: item.path,
    type: 'file',
    sha: item.sha,
    size: item.size,
    language: inferLanguage(item.path),
  }
}

async function loadRepository(url: string, rawRef?: string): Promise<{
  repository: GitHubRepositoryMetadata
  entries: SelectableGitHubTreeEntry[]
}> {
  const parsed = parseGitHubRepositoryUrl(url)
  const repoData = await requestRepo(parsed.owner, parsed.repo)
  const ref = validateGitHubRef(rawRef) ?? repoData.default_branch
  const commit = await requestCommit(parsed.owner, parsed.repo, ref)
  const tree = await requestTree(parsed.owner, parsed.repo, commit.commit.tree.sha)

  const treeEntries = tree.tree
    .slice(0, GITHUB_LIMITS.maxTreeEntries)
    .map(toTreeEntry)
    .filter((entry): entry is GitHubTreeEntry => Boolean(entry))

  const repository: GitHubRepositoryMetadata = {
    owner: parsed.owner,
    repo: parsed.repo,
    fullName: repoData.full_name || `${parsed.owner}/${parsed.repo}`,
    repoUrl: repoData.html_url || parsed.url,
    defaultBranch: repoData.default_branch,
    ref,
    commitSha: commit.sha,
    treeSha: tree.sha,
    private: repoData.private === true,
    treeTruncated: tree.truncated === true || tree.tree.length > GITHUB_LIMITS.maxTreeEntries,
  }

  return { repository, entries: toSelectableEntries(treeEntries) }
}

export async function previewGitHubRepository(url: string, ref?: string): Promise<GitHubPreviewResult> {
  const { repository, entries } = await loadRepository(url, ref)
  const skippedCount = entries.filter((entry) => entry.skipped).length
  return {
    repository,
    entries,
    defaultSelectedPaths: entries
      .filter((entry) => entry.selectedDefault)
      .map((entry) => entry.path),
    skippedCount,
    limits: GITHUB_LIMITS,
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function selectedSourceFor(filePath: string, selectedPaths: string[]): string {
  const normalized = selectedPaths.slice().sort((a, b) => b.length - a.length)
  return normalized.find((path) => filePath === path || filePath.startsWith(`${path}/`)) ?? filePath
}

export function buildGitHubChunkDocuments(input: {
  conversationId: string
  sourceId: unknown
  repository: Pick<GitHubRepositoryMetadata, 'owner' | 'repo' | 'repoUrl' | 'ref' | 'commitSha'>
  file: Pick<SelectableGitHubTreeEntry, 'path' | 'language'>
  selectedPaths: string[]
  chunks: string[]
}): Record<string, unknown>[] {
  return input.chunks.map((chunk, index) => ({
    conversationId: input.conversationId,
    sourceId: input.sourceId,
    owner: input.repository.owner,
    repo: input.repository.repo,
    repoUrl: input.repository.repoUrl,
    ref: input.repository.ref,
    commitSha: input.repository.commitSha,
    filePath: input.file.path,
    fileType: input.file.path.split('.').pop()?.toLowerCase(),
    language: input.file.language,
    chunkIndex: index,
    sourcePath: selectedSourceFor(input.file.path, input.selectedPaths),
    content: chunk,
    charCount: chunk.length,
    byteCount: byteLength(chunk),
  }))
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof GitHubContextError) return error.message
  if (error instanceof Error) return error.message
  return 'Failed to ingest file.'
}

export async function ingestGitHubRepository(
  conversationId: string,
  input: { url: string; ref?: string; selectedPaths: string[] },
): Promise<GitHubIngestResult> {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new GitHubContextError('invalid_conversation', 'Invalid conversation id.')
  }
  if (!Array.isArray(input.selectedPaths) || input.selectedPaths.length === 0) {
    throw new GitHubContextError('no_selection', 'Select at least one file or folder.')
  }

  const { repository, entries } = await loadRepository(input.url, input.ref)
  const selectedPaths = input.selectedPaths.map((path) => path.trim()).filter(Boolean)
  const expanded = expandSelectedFiles(entries, selectedPaths)
  if (expanded.files.length === 0) {
    throw new GitHubContextError('empty_selection', 'No ingestible files were selected.')
  }

  await GitHubRepositoryChunk.deleteMany({
    conversationId,
    owner: repository.owner,
    repo: repository.repo,
    ref: repository.ref,
  })
  await GitHubRepositorySource.deleteMany({
    conversationId,
    owner: repository.owner,
    repo: repository.repo,
    ref: repository.ref,
  })

  const source = await GitHubRepositorySource.create({
    conversationId,
    owner: repository.owner,
    repo: repository.repo,
    repoUrl: repository.repoUrl,
    defaultBranch: repository.defaultBranch,
    ref: repository.ref,
    commitSha: repository.commitSha,
    private: repository.private,
    treeTruncated: repository.treeTruncated,
    selectedPaths,
  })

  const skipped: GitHubSkip[] = [...expanded.skipped]
  const errors: Array<{ path: string; message: string }> = []
  const docs: Record<string, unknown>[] = []
  let totalTextBytes = 0
  let ingestedFileCount = 0

  for (const file of expanded.files) {
    if (!file.sha) {
      skipped.push({ path: file.path, reason: 'missing file sha' })
      continue
    }
    if (docs.length >= GITHUB_LIMITS.maxChunks) {
      skipped.push({ path: file.path, reason: 'chunk limit reached' })
      continue
    }

    try {
      const buffer = await requestBlob(repository.owner, repository.repo, file.sha)
      if (buffer.byteLength > GITHUB_LIMITS.maxFileBytes) {
        skipped.push({ path: file.path, reason: 'file too large' })
        continue
      }

      const text = decodeTextBuffer(buffer)
      if (!text) {
        skipped.push({ path: file.path, reason: 'binary or empty file' })
        continue
      }
      if (containsLikelySecret(text)) {
        skipped.push({ path: file.path, reason: 'likely secret content' })
        continue
      }

      const textBytes = byteLength(text)
      if (totalTextBytes + textBytes > GITHUB_LIMITS.maxTotalTextBytes) {
        skipped.push({ path: file.path, reason: 'total text limit reached' })
        continue
      }

      const chunks = chunkText(text)
      if (chunks.length === 0) {
        skipped.push({ path: file.path, reason: 'empty file' })
        continue
      }

      let accepted = 0
      const remainingChunkSlots = Math.max(0, GITHUB_LIMITS.maxChunks - docs.length)
      const acceptedChunks = chunks.slice(0, remainingChunkSlots)
      accepted = acceptedChunks.length
      docs.push(...buildGitHubChunkDocuments({
        conversationId,
        sourceId: source._id,
        repository,
        file,
        selectedPaths,
        chunks: acceptedChunks,
      }))

      if (accepted > 0) {
        totalTextBytes += textBytes
        ingestedFileCount += 1
      }
      if (accepted < chunks.length) skipped.push({ path: file.path, reason: 'chunk limit reached' })
    } catch (error) {
      errors.push({ path: file.path, message: publicErrorMessage(error) })
    }
  }

  if (docs.length > 0) await GitHubRepositoryChunk.insertMany(docs, { ordered: false })

  await GitHubRepositorySource.updateOne(
    { _id: source._id },
    {
      $set: {
        ingestedFileCount,
        chunkCount: docs.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
      },
    },
  )

  return {
    sourceId: String(source._id),
    repository,
    selectedFileCount: expanded.files.length,
    ingestedFileCount,
    chunkCount: docs.length,
    skipped,
    errors,
    limits: GITHUB_LIMITS,
  }
}
