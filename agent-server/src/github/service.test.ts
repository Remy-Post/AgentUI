import test from 'node:test'
import assert from 'node:assert/strict'
import { setGitHubToken } from './auth.ts'
import { previewGitHubRepository } from './service.ts'

type FetchCall = {
  url: string
  authorization?: string
}

function gitHubResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-remaining': '5000',
    },
  })
}

async function withMockGitHub<T>(
  handler: (url: URL, init?: RequestInit) => Response,
  callback: (calls: FetchCall[]) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch
  const calls: FetchCall[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const headers = new Headers(init?.headers)
    calls.push({
      url: url.toString(),
      authorization: headers.get('authorization') ?? undefined,
    })
    return handler(url, init)
  }) as typeof fetch

  try {
    return await callback(calls)
  } finally {
    globalThis.fetch = originalFetch
    setGitHubToken('')
  }
}

function previewHandler(url: URL): Response {
  if (url.pathname === '/repos/octocat/Hello-World') {
    return gitHubResponse({
      name: 'Hello-World',
      full_name: 'octocat/Hello-World',
      html_url: 'https://github.com/octocat/Hello-World',
      default_branch: 'main',
      private: false,
    })
  }

  if (url.pathname === '/repos/octocat/Hello-World/commits/main') {
    return gitHubResponse({
      sha: 'commit123',
      commit: { tree: { sha: 'tree123' } },
    })
  }

  if (url.pathname === '/repos/octocat/Hello-World/git/trees/tree123') {
    assert.equal(url.searchParams.get('recursive'), '1')
    return gitHubResponse({
      sha: 'tree123',
      truncated: true,
      tree: [
        { path: 'src', type: 'tree', sha: 'dir123' },
        { path: 'src/app.ts', type: 'blob', sha: 'file123', size: 120 },
        { path: '.env.local', type: 'blob', sha: 'secret123', size: 40 },
        { path: 'node_modules/pkg/index.js', type: 'blob', sha: 'dep123', size: 40 },
      ],
    })
  }

  return gitHubResponse({ message: 'not found' }, 404)
}

test('previews public repositories through mocked GitHub API without auth', async () => {
  await withMockGitHub(previewHandler, async (calls) => {
    const preview = await previewGitHubRepository('https://github.com/octocat/Hello-World')

    assert.equal(preview.repository.fullName, 'octocat/Hello-World')
    assert.equal(preview.repository.ref, 'main')
    assert.equal(preview.repository.commitSha, 'commit123')
    assert.equal(preview.repository.treeTruncated, true)
    assert.deepEqual(preview.defaultSelectedPaths, ['src/app.ts'])
    assert.equal(preview.entries.find((entry) => entry.path === '.env.local')?.skipReason, 'sensitive path')
    assert.equal(preview.entries.find((entry) => entry.path === 'node_modules/pkg/index.js')?.skipReason, 'excluded directory')
    assert.equal(calls.every((call) => !call.authorization), true)
  })
})

test('previews private-access path with configured GitHub token', async () => {
  setGitHubToken('github_pat_mocked')
  await withMockGitHub(previewHandler, async (calls) => {
    await previewGitHubRepository('octocat/Hello-World')

    assert.equal(calls.length, 3)
    assert.equal(calls.every((call) => call.authorization === 'token github_pat_mocked'), true)
  })
})
