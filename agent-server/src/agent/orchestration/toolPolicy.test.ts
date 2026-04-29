import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentDefinitions, ORCHESTRATOR_AGENT_NAME } from './agents.ts'
import { ensureTurnSubagents, planDynamicSubagentTasks } from './dynamicSubagents.ts'
import { buildQueryOptionsFromRuntime } from './options.ts'
import { normalizeSdkMessage } from './events.ts'
import { expandToolNames, makeToolPermissionPolicy, resolveToolPolicy } from './toolPolicy.ts'
import { buildGwsCallArgs, GwsCommandError } from '../../mcp/gwsCommand.ts'

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

test('does not leak Google Workspace service toggles into SDK tools', () => {
  const policy = resolveToolPolicy([
    { id: 'read_file', enabled: true },
    { id: 'google.workspace.drive', enabled: true },
    { id: 'google.workspace.gmail', enabled: false },
  ])

  assert.deepEqual(expandToolNames(['google.workspace.drive']), [])
  assert.deepEqual(policy.availableTools, ['Agent', 'Read'])
  assert.equal(policy.enabledSdkTools.has('google.workspace.drive'), false)
  assert.equal(policy.enabledWorkspaceServices.has('drive'), true)
  assert.equal(policy.enabledWorkspaceServices.has('gmail'), false)
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

test('attaches Google Workspace MCP only to scoped subagents', () => {
  const policy = resolveToolPolicy([
    { id: 'read_file', enabled: true },
    { id: 'google.workspace.gmail', enabled: true },
    { id: 'google.workspace.drive', enabled: false },
  ])
  const agents = buildAgentDefinitions(policy, [
    {
      name: 'gmail worker',
      description: 'Gmail worker',
      prompt: 'Handle Gmail tasks.',
      mcpServices: ['gmail'],
    },
  ])

  assert.equal(agents[ORCHESTRATOR_AGENT_NAME].mcpServers, undefined)
  assert.deepEqual(agents.gmail_worker.tools, ['mcp__agentui_gws_gmail__*'])
  assert.equal(agents.gmail_worker.mcpServers?.length, 1)
  const serverSpec = agents.gmail_worker.mcpServers?.[0] as Record<string, { env?: Record<string, string> }>
  assert.equal(serverSpec.agentui_gws_gmail.env?.GWS_ALLOWED_SERVICES, 'gmail')
})

test('does not inject hidden runtime subagents when Mongo has none selected', () => {
  const policy = resolveToolPolicy([{ id: 'read_file', enabled: true }])
  const agents = buildAgentDefinitions(policy, [])

  assert.deepEqual(Object.keys(agents), [ORCHESTRATOR_AGENT_NAME])
})

test('plans separate one-purpose dynamic subagents with narrow tool sets', () => {
  const policy = resolveToolPolicy([
    { id: 'read_file', enabled: true },
    { id: 'grep', enabled: true },
    { id: 'list_files', enabled: true },
    { id: 'edit_file', enabled: true },
    { id: 'shell.exec', enabled: true },
    { id: 'web.search', enabled: false },
    { id: 'web.fetch', enabled: false },
  ])
  const tasks = planDynamicSubagentTasks(
    [
      '- Find where messages stream from the SDK',
      '- Fix the streaming bug',
      '- Run the typecheck',
    ].join('\n'),
    policy,
    { _id: 'conversation-1', model: 'claude-sonnet-4' },
  )

  assert.equal(tasks.some((task) => task.kind === 'research'), true)
  assert.equal(tasks.some((task) => task.kind === 'code'), true)
  assert.equal(tasks.some((task) => task.kind === 'test'), true)
  assert.deepEqual(tasks.find((task) => task.kind === 'research')?.tools, ['Read', 'Grep', 'Glob'])
  assert.deepEqual(tasks.find((task) => task.kind === 'code')?.tools, ['Read', 'Grep', 'Glob', 'Edit', 'MultiEdit'])
  assert.deepEqual(tasks.find((task) => task.kind === 'test')?.tools, ['Read', 'Grep', 'Glob', 'Bash'])
})

test('plans Workspace tasks with only the required service MCP scope', () => {
  const policy = resolveToolPolicy([
    { id: 'google.workspace.gmail', enabled: true },
    { id: 'google.workspace.drive', enabled: true },
  ])
  const tasks = planDynamicSubagentTasks(
    'Summarize unread Gmail messages from my inbox',
    policy,
    { _id: 'conversation-1', model: 'claude-sonnet-4' },
  )

  assert.equal(tasks.length, 1)
  assert.deepEqual(tasks[0].tools, [])
  assert.deepEqual(tasks[0].mcpServices, ['gmail'])
})

test('does not plan Workspace tasks when the service toggle is disabled', () => {
  const policy = resolveToolPolicy([
    { id: 'google.workspace.gmail', enabled: false },
    { id: 'google.workspace.drive', enabled: true },
  ])
  const tasks = planDynamicSubagentTasks(
    'Summarize unread Gmail messages from my inbox',
    policy,
    { _id: 'conversation-1', model: 'claude-sonnet-4' },
  )

  assert.deepEqual(tasks, [])
})

test('reuses an existing suitable Workspace subagent instead of creating another', async () => {
  const policy = resolveToolPolicy([{ id: 'google.workspace.gmail', enabled: true }])
  const existing = {
    _id: 'subagent-1',
    name: 'gmail_agent',
    description: 'Gmail workspace worker',
    prompt: 'Handle Gmail tasks.',
    mcpServices: ['gmail' as const],
  }
  const selected = await ensureTurnSubagents(
    'Summarize unread Gmail messages from my inbox',
    { _id: 'conversation-1', model: 'claude-sonnet-4' },
    [existing],
    policy,
  )

  assert.deepEqual(selected, [existing])
})

test('rejects unsafe raw gws command construction before spawning', () => {
  assert.throws(
    () => buildGwsCallArgs('gmail', { resource: 'users.messages', method: '+send' }, ['gmail']),
    (error) => error instanceof GwsCommandError && error.code === 'validation_failure',
  )
  assert.throws(
    () => buildGwsCallArgs('drive', { resource: '../files', method: 'list' }, ['drive']),
    (error) => error instanceof GwsCommandError && error.code === 'validation_failure',
  )
  assert.throws(
    () => buildGwsCallArgs('gmail', { resource: 'users.messages', method: 'list', rawArgs: ['--output', 'x'] }, ['gmail']),
    (error) => error instanceof GwsCommandError && error.code === 'validation_failure',
  )
})

test('prevents gws command construction for disabled services', () => {
  assert.throws(
    () => buildGwsCallArgs('gmail', { resource: 'users.messages', method: 'list' }, ['drive']),
    (error) => error instanceof GwsCommandError && error.code === 'unsupported_service',
  )
})

test('does not plan subagents for simple non-tool chat', () => {
  const policy = resolveToolPolicy([{ id: 'read_file', enabled: true }])
  const tasks = planDynamicSubagentTasks(
    'Hello, can you answer a quick question?',
    policy,
    { _id: 'conversation-1', model: 'claude-sonnet-4' },
  )

  assert.deepEqual(tasks, [])
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
  assert.deepEqual(Object.keys(options.agents ?? {}), [ORCHESTRATOR_AGENT_NAME])
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
