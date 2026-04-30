import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SdkMemoryError,
  deleteSdkMemoryFile,
  listSdkMemory,
  readSdkMemoryFile,
  resolveSdkMemoryFileTarget,
  writeSdkMemoryFile,
} from './sdkMemory.ts'

test('SDK memory file service reads, writes, and lists local scoped memory', async () => {
  const previousRoot = process.env.AGENT_SCAFFOLD_ROOT
  const root = await mkdtemp(join(tmpdir(), 'agentui-sdk-memory-'))
  process.env.AGENT_SCAFFOLD_ROOT = root
  try {
    const written = await writeSdkMemoryFile({
      scope: 'local',
      agentName: 'research_agent',
      relativePath: 'notes.md',
      content: '# Memory\nRemember this.',
    })

    assert.equal(written.scope, 'local')
    assert.equal(written.agentName, 'research_agent')
    assert.equal(written.relativePath, 'notes.md')

    const read = await readSdkMemoryFile({
      scope: 'local',
      agentName: 'research_agent',
      relativePath: 'notes.md',
    })
    assert.equal(read.content, '# Memory\nRemember this.')

    const listed = await listSdkMemory()
    const localRoot = listed.roots.find((entry) => entry.scope === 'local')
    assert.ok(localRoot)
    assert.equal(localRoot.agents[0].agentName, 'research_agent')
    assert.equal(localRoot.agents[0].files[0].relativePath, 'notes.md')
  } finally {
    if (previousRoot === undefined) delete process.env.AGENT_SCAFFOLD_ROOT
    else process.env.AGENT_SCAFFOLD_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})

test('SDK memory file service rejects traversal and unconfigured roots', () => {
  assert.throws(
    () =>
      resolveSdkMemoryFileTarget({
        scope: 'local',
        agentName: 'research_agent',
        relativePath: '../escape.md',
      }),
    (error) => error instanceof SdkMemoryError && error.code === 'invalid_path',
  )

  assert.throws(
    () =>
      resolveSdkMemoryFileTarget({
        scope: 'local',
        agentName: '../agent',
        relativePath: 'notes.md',
      }),
    (error) => error instanceof SdkMemoryError && error.code === 'invalid_agent_name',
  )

  assert.throws(
    () =>
      resolveSdkMemoryFileTarget({
        scope: 'auto',
        relativePath: 'memory.md',
      }),
    (error) => error instanceof SdkMemoryError && error.code === 'unknown_root',
  )
})

async function createSymlinkOrSkip(
  t: TestContext,
  target: string,
  linkPath: string,
  type: 'file' | 'dir',
): Promise<boolean> {
  try {
    await symlink(target, linkPath, process.platform === 'win32' && type === 'dir' ? 'junction' : type)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES' || code === 'EINVAL') {
      t.skip(`Symlinks are not supported in this test environment: ${code}`)
      return false
    }
    throw error
  }
}

test('SDK memory file service rejects symlink escape attempts', async (t) => {
  const previousRoot = process.env.AGENT_SCAFFOLD_ROOT
  const root = await mkdtemp(join(tmpdir(), 'agentui-sdk-memory-symlink-'))
  process.env.AGENT_SCAFFOLD_ROOT = root
  try {
    const agentRoot = join(root, '.claude', 'agent-memory-local', 'research_agent')
    const outside = join(root, 'outside')
    await mkdir(agentRoot, { recursive: true })
    await mkdir(outside, { recursive: true })

    const outsideFile = join(outside, 'memory.md')
    const linkedFile = join(agentRoot, 'linked.md')
    await writeFile(outsideFile, 'outside memory', 'utf8')
    if (!(await createSymlinkOrSkip(t, outsideFile, linkedFile, 'file'))) return

    await assert.rejects(
      () =>
        readSdkMemoryFile({
          scope: 'local',
          agentName: 'research_agent',
          relativePath: 'linked.md',
        }),
      (error) => error instanceof SdkMemoryError && error.code === 'symlink_not_allowed',
    )
    await assert.rejects(
      () =>
        writeSdkMemoryFile({
          scope: 'local',
          agentName: 'research_agent',
          relativePath: 'linked.md',
          content: 'replace outside',
        }),
      (error) => error instanceof SdkMemoryError && error.code === 'symlink_not_allowed',
    )
    await assert.rejects(
      () =>
        deleteSdkMemoryFile({
          scope: 'local',
          agentName: 'research_agent',
          relativePath: 'linked.md',
        }),
      (error) => error instanceof SdkMemoryError && error.code === 'symlink_not_allowed',
    )
    assert.equal(await readFile(outsideFile, 'utf8'), 'outside memory')

    const linkedDir = join(agentRoot, 'escape')
    if (!(await createSymlinkOrSkip(t, outside, linkedDir, 'dir'))) return
    await assert.rejects(
      () =>
        writeSdkMemoryFile({
          scope: 'local',
          agentName: 'research_agent',
          relativePath: 'escape/owned.md',
          content: 'owned',
        }),
      (error) => error instanceof SdkMemoryError && error.code === 'symlink_not_allowed',
    )

    const listed = await listSdkMemory()
    const localRoot = listed.roots.find((entry) => entry.scope === 'local')
    const listedFiles = localRoot?.agents.flatMap((agent) => agent.files) ?? []
    assert.equal(listedFiles.some((file) => file.relativePath === 'linked.md'), false)
    assert.equal(listedFiles.some((file) => file.relativePath.startsWith('escape/')), false)
  } finally {
    if (previousRoot === undefined) delete process.env.AGENT_SCAFFOLD_ROOT
    else process.env.AGENT_SCAFFOLD_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})
