import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentDefinitions, ORCHESTRATOR_AGENT_NAME } from './agents.ts'
import { buildQueryOptionsFromRuntime } from './options.ts'
import { normalizeSdkMessage } from './events.ts'
import { makeToolPermissionPolicy, resolveToolPolicy } from './toolPolicy.ts'

const permissionOptions = {
  signal: new AbortController().signal,
  toolUseID: 'tool-use-1',
}

test('maps enabled UI tools to SDK tools and excludes disabled tools', () => {
  const policy = resolveToolPolicy([
    { id: 'read_file', enabled: true },
    { id: 'grep', enabled: true },
    { id: 'list_files', enabled: true },
    { id: 'shell.exec', enabled: false },
  ])

  assert.deepEqual(policy.availableTools, ['Agent', 'Read', 'Grep', 'Glob'])
  assert.equal(policy.enabledSdkTools.has('Bash'), false)
  assert.equal(policy.disallowedTools.includes('Bash'), true)
})

test('denies parent direct tool use while allowing Agent delegation', async () => {
  const policy = resolveToolPolicy([{ id: 'read_file', enabled: true }])
  const canUseTool = makeToolPermissionPolicy(policy)

  assert.equal((await canUseTool('Agent', {}, permissionOptions)).behavior, 'allow')
  const directRead = await canUseTool('Read', { file_path: 'README.md' }, permissionOptions)
  assert.equal(directRead.behavior, 'deny')
})

test('denies sensitive file access from subagents', async () => {
  const policy = resolveToolPolicy([
    { id: 'read_file', enabled: true },
    { id: 'edit_file', enabled: true },
  ])
  const canUseTool = makeToolPermissionPolicy(policy)

  const result = await canUseTool('Edit', { file_path: '.env' }, {
    ...permissionOptions,
    agentID: 'agent-1',
  })

  assert.equal(result.behavior, 'deny')
})

test('narrows subagent tools to the enabled SDK surface', () => {
  const policy = resolveToolPolicy([
    { id: 'read_file', enabled: true },
    { id: 'grep', enabled: true },
    { id: 'shell.exec', enabled: false },
  ])
  const agents = buildAgentDefinitions(policy, [
    {
      name: 'custom worker',
      description: 'Custom test worker',
      prompt: 'Do the work.',
      tools: ['read_file', 'grep', 'shell.exec'],
    },
  ])

  assert.deepEqual(agents[ORCHESTRATOR_AGENT_NAME].tools, ['Agent'])
  assert.deepEqual(agents.custom_worker.tools, ['Read', 'Grep'])
  assert.equal(agents.custom_worker.disallowedTools?.includes('Bash'), true)
})

test('builds resume-aware query options without changing the SSE contract', () => {
  const options = buildQueryOptionsFromRuntime(
    {
      _id: 'conversation-1',
      model: 'claude-sonnet-4',
      sdkSessionId: 'existing-session-id',
    },
    {
      tools: [{ id: 'read_file', enabled: true }],
      subagents: [],
      skills: [{ name: 'repo-scout' }],
    },
  )

  assert.equal(options.agent, ORCHESTRATOR_AGENT_NAME)
  assert.equal(options.resume, 'existing-session-id')
  assert.deepEqual(options.tools, ['Agent', 'Read'])
  assert.deepEqual(options.skills, ['repo-scout'])
})

test('normalizes SDK progress messages to existing SSE event names', () => {
  const event = normalizeSdkMessage({
    type: 'system',
    subtype: 'task_progress',
    task_id: 'task-1',
    description: 'Searching',
    usage: { total_tokens: 1, tool_uses: 1, duration_ms: 10 },
    last_tool_name: 'Grep',
    uuid: '00000000-0000-4000-8000-000000000001',
    session_id: 'session-1',
  })

  assert.equal(event?.name, 'tool_progress')
  assert.equal(event?.data.tool_name, 'Grep')
})
