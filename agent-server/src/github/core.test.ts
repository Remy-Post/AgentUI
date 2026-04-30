import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  GitHubContextError,
  chunkText,
  containsLikelySecret,
  decodeTextBuffer,
  expandSelectedFiles,
  parseGitHubRepositoryUrl,
  skipReasonForEntry,
  toSelectableEntries,
  validateGitHubRef,
  validateRepoPath,
} from './core.ts'
import { buildGitHubChunkDocuments } from './service.ts'

test('parses safe GitHub repository URLs and shorthand', () => {
  assert.deepEqual(parseGitHubRepositoryUrl('https://github.com/octocat/Hello-World.git'), {
    owner: 'octocat',
    repo: 'Hello-World',
    url: 'https://github.com/octocat/Hello-World',
  })
  assert.deepEqual(parseGitHubRepositoryUrl('octocat/Hello-World'), {
    owner: 'octocat',
    repo: 'Hello-World',
    url: 'https://github.com/octocat/Hello-World',
  })
  assert.equal(parseGitHubRepositoryUrl('https://github.com/octocat/Hello-World/tree/main').repo, 'Hello-World')
})

test('rejects unsupported GitHub URLs, refs, and unsafe paths', () => {
  assert.throws(
    () => parseGitHubRepositoryUrl('https://github.example.com/octocat/Hello-World'),
    (error) => error instanceof GitHubContextError && error.code === 'unsupported_host',
  )
  assert.throws(
    () => parseGitHubRepositoryUrl('git@github.com:octocat/Hello-World.git'),
    (error) => error instanceof GitHubContextError,
  )
  assert.equal(validateGitHubRef('feature/context-loader'), 'feature/context-loader')
  assert.throws(() => validateGitHubRef('../main'), GitHubContextError)
  assert.equal(validateRepoPath('src/index.ts'), 'src/index.ts')
  assert.throws(() => validateRepoPath('../.env'), GitHubContextError)
  assert.throws(() => validateRepoPath('src\\index.ts'), GitHubContextError)
})

test('filters unsafe, generated, binary, lockfile, and large files by default', () => {
  assert.equal(skipReasonForEntry({ path: 'node_modules/pkg/index.js', type: 'file', size: 10 }), 'excluded directory')
  assert.equal(skipReasonForEntry({ path: '.env.local', type: 'file', size: 10 }), 'sensitive path')
  assert.equal(skipReasonForEntry({ path: 'package-lock.json', type: 'file', size: 10 }), 'lockfile')
  assert.equal(skipReasonForEntry({ path: 'dist/app.min.js', type: 'file', size: 10 }), 'excluded directory')
  assert.equal(skipReasonForEntry({ path: 'src/app.js.map', type: 'file', size: 10 }), 'generated file')
  assert.equal(skipReasonForEntry({ path: 'assets/logo.png', type: 'file', size: 10 }), 'binary or media file')
  assert.equal(skipReasonForEntry({ path: 'src/app.ts', type: 'file', size: 300_000 }), 'file too large')
  assert.equal(skipReasonForEntry({ path: 'src/app.ts', type: 'file', size: 100 }), null)
})

test('expands folder and file selections with limits and skipped reasons', () => {
  const entries = toSelectableEntries([
    { path: 'src', type: 'dir' },
    { path: 'src/app.ts', type: 'file', size: 100 },
    { path: 'src/secret.env', type: 'file', size: 100 },
    { path: 'README.md', type: 'file', size: 100 },
  ])

  const expanded = expandSelectedFiles(entries, ['src', 'README.md'], {
    maxSelectedFiles: 2,
    maxRepositoryBytes: 1_000,
  })

  assert.deepEqual(expanded.files.map((file) => file.path), ['README.md', 'src/app.ts'])
  assert.deepEqual(expanded.skipped, [{ path: 'src/secret.env', reason: 'sensitive path' }])

  const limited = expandSelectedFiles(entries, ['src', 'README.md'], {
    maxSelectedFiles: 1,
    maxRepositoryBytes: 1_000,
  })
  assert.equal(limited.files.length, 1)
  assert.equal(limited.skipped.some((skip) => skip.reason === 'selected file limit reached'), true)
})

test('detects binary and likely secret content before chunking', () => {
  assert.equal(decodeTextBuffer(Buffer.from('hello\nworld')), 'hello\nworld')
  assert.equal(decodeTextBuffer(Buffer.from([0, 1, 2, 3, 4])), null)
  assert.equal(containsLikelySecret('GITHUB_TOKEN=github_pat_abcdefghijklmnopqrstuvwxyz123456'), true)
  assert.equal(containsLikelySecret('const answer = 42'), false)
})

test('chunks text and preserves repository metadata for every chunk', () => {
  const chunks = chunkText(['one', 'two', 'three', 'four'].join('\n'), {
    chunkChars: 8,
    chunkOverlap: 2,
  })
  assert.equal(chunks.length > 1, true)

  const sourceId = new mongoose.Types.ObjectId()
  const docs = buildGitHubChunkDocuments({
    conversationId: '64f000000000000000000001',
    sourceId,
    repository: {
      owner: 'octocat',
      repo: 'Hello-World',
      repoUrl: 'https://github.com/octocat/Hello-World',
      ref: 'main',
      commitSha: 'abc123',
    },
    file: { path: 'src/app.ts', language: 'TypeScript' },
    selectedPaths: ['src'],
    chunks: ['export const value = 1', 'export const next = 2'],
  })

  assert.equal(docs.length, 2)
  assert.equal(docs[0].owner, 'octocat')
  assert.equal(docs[0].repo, 'Hello-World')
  assert.equal(docs[0].repoUrl, 'https://github.com/octocat/Hello-World')
  assert.equal(docs[0].ref, 'main')
  assert.equal(docs[0].commitSha, 'abc123')
  assert.equal(docs[0].filePath, 'src/app.ts')
  assert.equal(docs[0].language, 'TypeScript')
  assert.equal(docs[0].chunkIndex, 0)
  assert.equal(docs[0].sourcePath, 'src')
  assert.equal(docs[1].chunkIndex, 1)
})

