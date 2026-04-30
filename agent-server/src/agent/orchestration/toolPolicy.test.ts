import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import { buildAgentDefinitions, ORCHESTRATOR_AGENT_NAME } from './agents.ts'
import { ensureTurnSubagents, planDynamicSubagentTasks } from './dynamicSubagents.ts'
import { buildQueryOptionsFromRuntime } from './options.ts'
import { normalizeSdkMessage } from './events.ts'
import { writeSubagentFile } from '../scaffold.ts'
import { expandToolNames, makeToolPermissionPolicy, resolveToolPolicy } from './toolPolicy.ts'
import { DEFAULT_TOOLS, LEGACY_TOOL_ALIASES, buildToolRegistryUpsert } from './defaultTools.ts'
import { buildGwsCallArgs, GwsCommandError } from '../../mcp/gwsCommand.ts'
import {
  DbCommandError,
  buildMySqlDelete,
  buildMySqlInsert,
  buildMySqlSelect,
  buildMySqlUpdate,
  executeMongoFind,
} from '../../mcp/dbCommand.ts'
import { isLocalDbHost, redactSecretText } from '../../mcp/dbTypes.ts'

const permissionOptions = {
  signal: new AbortController().signal,
  toolUseID: 'tool-use-1',
}

test('catalog includes documented tools, metadata, quick pins, and legacy aliases', () => {
  const ids = new Set(DEFAULT_TOOLS.map((tool) => tool.id))

  for (const id of [
    'Agent',
    'AskUserQuestion',
    'Bash',
    'CronCreate',
    'CronDelete',
    'CronList',
    'Edit',
    'EnterPlanMode',
    'EnterWorktree',
    'ExitPlanMode',
    'ExitWorktree',
    'Glob',
    'Grep',
    'ListMcpResourcesTool',
    'LSP',
    'Monitor',
    'NotebookEdit',
    'PowerShell',
    'Read',
    'ReadMcpResourceTool',
    'SendMessage',
    'Skill',
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskOutput',
    'TaskStop',
    'TaskUpdate',
    'TeamCreate',
    'TeamDelete',
    'TodoWrite',
    'ToolSearch',
    'WebFetch',
    'WebSearch',
    'Write',
    'MultiEdit',
    'notes.read',
    'notes.create',
    'notes.update',
    'notes.delete',
  ]) {
    assert.equal(ids.has(id), true, `${id} missing from tool catalog`)
  }

  assert.deepEqual(
    DEFAULT_TOOLS
      .filter((tool) => typeof tool.quickRank === 'number')
      .sort((a, b) => (a.quickRank ?? 0) - (b.quickRank ?? 0))
      .map((tool) => tool.id),
    ['Bash', 'Read', 'WebSearch'],
  )
  assert.equal(DEFAULT_TOOLS.find((tool) => tool.id === 'Agent')?.locked, true)
  assert.deepEqual(LEGACY_TOOL_ALIASES['shell.exec'], ['Bash'])
})

test('locked tool registry upserts do not update enabled in conflicting operators', () => {
  const agentTool = DEFAULT_TOOLS.find((tool) => tool.id === 'Agent')
  assert.ok(agentTool)

  const op = buildToolRegistryUpsert(agentTool, true)
  assert.equal(op.updateOne.update.$set.enabled, true)
  assert.equal(Object.hasOwn(op.updateOne.update.$setOnInsert, 'enabled'), false)
})

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

test('maps canonical SDK tools and db toggles without leaking db ids into built-ins', () => {
  const policy = resolveToolPolicy([
    { id: 'Read', enabled: true },
    { id: 'Bash', enabled: true },
    { id: 'mongodb.read', enabled: true },
    { id: 'mysql.update', enabled: false },
  ])

  assert.deepEqual(policy.availableTools, ['Agent', 'Read', 'Bash'])
  assert.equal(policy.enabledDbToolIds.has('mongodb.read'), true)
  assert.equal(policy.enabledDbToolIds.has('mysql.update'), false)
  assert.equal(policy.enabledSdkTools.has('mongodb.read'), false)
  assert.deepEqual(expandToolNames(['mongodb.read', 'Read']), ['Read'])
})

test('maps notes toggles without leaking notes ids into built-ins', () => {
  const policy = resolveToolPolicy([
    { id: 'Read', enabled: true },
    { id: 'notes.read', enabled: true },
    { id: 'notes.delete', enabled: false },
  ])

  assert.deepEqual(policy.availableTools, ['Agent', 'Read'])
  assert.equal(policy.enabledNotesToolIds.has('notes.read'), true)
  assert.equal(policy.enabledNotesToolIds.has('notes.delete'), false)
  assert.equal(policy.enabledSdkTools.has('notes.read'), false)
  assert.deepEqual(expandToolNames(['notes.read', 'Read']), ['Read'])
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

test('parent allowed to call Agent and any enabled SDK tool directly', async () => {
  const policy = resolveToolPolicy([{ id: 'read_file', enabled: true }])
  const canUseTool = makeToolPermissionPolicy(policy)

  assert.equal((await canUseTool('Agent', {}, permissionOptions)).behavior, 'allow')
  const directRead = await canUseTool('Read', { file_path: 'README.md' }, permissionOptions)
  assert.equal(directRead.behavior, 'allow')
})

test('parent denied disabled SDK tools with the AgentUI policy message', async () => {
  const policy = resolveToolPolicy([{ id: 'read_file', enabled: true }])
  const canUseTool = makeToolPermissionPolicy(policy)

  const result = await canUseTool('Bash', { command: 'echo hi' }, permissionOptions)
  assert.equal(result.behavior, 'deny')
  if (result.behavior === 'deny') {
    assert.match(result.message, /AgentUI tool policy/)
  }
})

test('subagent denied from spawning another Agent (no nested delegation)', async () => {
  const policy = resolveToolPolicy([{ id: 'read_file', enabled: true }])
  const canUseTool = makeToolPermissionPolicy(policy)

  const result = await canUseTool('Agent', {}, { ...permissionOptions, agentID: 'sub-1' })
  assert.equal(result.behavior, 'deny')
})

test('parent denied forbidden Bash commands', async () => {
  const policy = resolveToolPolicy([{ id: 'shell.exec', enabled: true }])
  const canUseTool = makeToolPermissionPolicy(policy)

  const result = await canUseTool('Bash', { command: 'rm -rf /' }, permissionOptions)
  assert.equal(result.behavior, 'deny')
})

test('parent denied sensitive .env path access', async () => {
  const policy = resolveToolPolicy([{ id: 'edit_file', enabled: true }])
  const canUseTool = makeToolPermissionPolicy(policy)

  const result = await canUseTool('Edit', { file_path: '.env' }, permissionOptions)
  assert.equal(result.behavior, 'deny')
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

test('passes subagent SDK memory scope when enabled', () => {
  const policy = resolveToolPolicy([{ id: 'read_file', enabled: true }])
  const agents = buildAgentDefinitions(policy, [
    {
      name: 'memory worker',
      description: 'Memory worker',
      prompt: 'Remember scoped work.',
      tools: ['read_file'],
      memory: 'local',
    },
    {
      name: 'stateless worker',
      description: 'Stateless worker',
      prompt: 'Do not persist memory.',
      tools: ['read_file'],
      memory: 'none',
    },
  ])

  assert.equal(agents.memory_worker.memory, 'local')
  assert.equal(agents.stateless_worker.memory, undefined)
})

test('materializes subagent memory frontmatter only when enabled', async () => {
  const previousRoot = process.env.AGENT_SCAFFOLD_ROOT
  const root = await mkdtemp(join(tmpdir(), 'agentui-memory-frontmatter-'))
  process.env.AGENT_SCAFFOLD_ROOT = root
  try {
    await writeSubagentFile({
      _id: new mongoose.Types.ObjectId(),
      name: 'memory_worker',
      description: 'Memory worker',
      prompt: 'Remember scoped work.',
      memory: 'local',
      enabled: true,
    } as never)
    const content = await readFile(join(root, '.claude', 'agents', 'memory_worker.md'), 'utf8')
    assert.match(content, /memory: local/)

    await writeSubagentFile({
      _id: new mongoose.Types.ObjectId(),
      name: 'stateless_worker',
      description: 'Stateless worker',
      prompt: 'Do not persist memory.',
      memory: 'none',
      enabled: true,
    } as never)
    const stateless = await readFile(join(root, '.claude', 'agents', 'stateless_worker.md'), 'utf8')
    assert.doesNotMatch(stateless, /memory:/)
  } finally {
    if (previousRoot === undefined) delete process.env.AGENT_SCAFFOLD_ROOT
    else process.env.AGENT_SCAFFOLD_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
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

test('attaches database MCP only to scoped subagents with enabled db tools', () => {
  const policy = resolveToolPolicy([
    { id: 'mongodb.read', enabled: true },
    { id: 'mongodb.update', enabled: false },
    { id: 'mysql.read', enabled: true },
  ])
  const agents = buildAgentDefinitions(policy, [
    {
      name: 'db worker',
      description: 'Database worker',
      prompt: 'Handle database tasks.',
      tools: ['mongodb.read', 'mongodb.update', 'mysql.read'],
    },
  ])

  assert.deepEqual(agents.db_worker.tools, ['mcp__agentui_db__*'])
  assert.equal(agents.db_worker.mcpServers?.length, 1)
  const serverSpec = agents.db_worker.mcpServers?.[0] as Record<string, { env?: Record<string, string> }>
  assert.equal(serverSpec.agentui_db.env?.AGENTUI_DB_ALLOWED_TOOLS, 'mongodb.read,mysql.read')
  assert.ok(serverSpec.agentui_db.env?.[process.platform === 'win32' ? 'Path' : 'PATH'])
})

test('attaches Notes MCP to subagents with enabled note operations', () => {
  const policy = resolveToolPolicy([
    { id: 'notes.read', enabled: true },
    { id: 'notes.create', enabled: true },
    { id: 'notes.update', enabled: true },
    { id: 'notes.delete', enabled: true },
  ])
  const agents = buildAgentDefinitions(policy, [
    {
      name: 'notes worker',
      description: 'Notes worker',
      prompt: 'Handle notes.',
    },
  ])

  assert.equal(agents[ORCHESTRATOR_AGENT_NAME].mcpServers, undefined)
  assert.deepEqual(agents.notes_worker.tools, [
    'mcp__agentui_notes__notes_search',
    'mcp__agentui_notes__notes_get',
    'mcp__agentui_notes__notes_create',
    'mcp__agentui_notes__notes_update',
    'mcp__agentui_notes__notes_delete',
  ])
  assert.equal(agents.notes_worker.mcpServers?.length, 1)
  const serverSpec = agents.notes_worker.mcpServers?.[0] as Record<string, { env?: Record<string, string> }>
  assert.equal(
    serverSpec.agentui_notes.env?.AGENTUI_NOTES_ALLOWED_TOOLS,
    'notes.read,notes.create,notes.update,notes.delete',
  )
})

test('narrows Notes MCP operations for explicitly scoped subagents', () => {
  const policy = resolveToolPolicy([
    { id: 'notes.read', enabled: true },
    { id: 'notes.create', enabled: false },
    { id: 'notes.delete', enabled: true },
  ])
  const agents = buildAgentDefinitions(policy, [
    {
      name: 'notes worker',
      description: 'Notes worker',
      prompt: 'Handle selected notes operations.',
      tools: ['notes.read', 'notes.create', 'notes.delete'],
    },
  ])

  assert.deepEqual(agents.notes_worker.tools, [
    'mcp__agentui_notes__notes_search',
    'mcp__agentui_notes__notes_get',
    'mcp__agentui_notes__notes_delete',
  ])
  const serverSpec = agents.notes_worker.mcpServers?.[0] as Record<string, { env?: Record<string, string> }>
  assert.equal(serverSpec.agentui_notes.env?.AGENTUI_NOTES_ALLOWED_TOOLS, 'notes.read,notes.delete')
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

test('plans database tasks with only enabled operation toggles', () => {
  const policy = resolveToolPolicy([
    { id: 'mongodb.read', enabled: true },
    { id: 'mongodb.update', enabled: true },
    { id: 'mongodb.delete', enabled: false },
    { id: 'mysql.read', enabled: false },
  ])
  const tasks = planDynamicSubagentTasks(
    'Find MongoDB customer records and update the matching collection',
    policy,
    { _id: 'conversation-1', model: 'claude-sonnet-4' },
  )

  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].kind, 'database')
  assert.deepEqual(tasks[0].tools, ['mongodb.read', 'mongodb.update'])
})

test('plans Notes tasks with only enabled operation toggles', () => {
  const policy = resolveToolPolicy([
    { id: 'notes.read', enabled: true },
    { id: 'notes.create', enabled: true },
    { id: 'notes.update', enabled: false },
    { id: 'notes.delete', enabled: true },
  ])
  const tasks = planDynamicSubagentTasks(
    [
      '- Remember this in my notes: compact responses are preferred',
      '- Search my notes for AgentUI preferences',
      '- Forget the obsolete setup note',
    ].join('\n'),
    policy,
    { _id: 'conversation-1', model: 'claude-sonnet-4' },
  )

  assert.equal(tasks.length, 3)
  assert.deepEqual(tasks.map((task) => task.kind), ['notes', 'notes', 'notes'])
  assert.deepEqual(tasks.map((task) => task.tools), [['notes.create'], ['notes.read'], ['notes.read', 'notes.delete']])
})

test('database MCP permission policy gates operations by toggle', async () => {
  const policy = resolveToolPolicy([
    { id: 'mongodb.read', enabled: true },
    { id: 'mongodb.delete', enabled: false },
  ])
  const canUseTool = makeToolPermissionPolicy(policy)

  assert.equal(
    (await canUseTool('mcp__agentui_db__db_mongodb_find', {}, { ...permissionOptions, agentID: 'agent-1' })).behavior,
    'allow',
  )
  assert.equal(
    (await canUseTool('mcp__agentui_db__db_mongodb_delete', {}, { ...permissionOptions, agentID: 'agent-1' })).behavior,
    'deny',
  )
})

test('Notes MCP permission policy gates operations by toggle', async () => {
  const policy = resolveToolPolicy([
    { id: 'notes.read', enabled: true },
    { id: 'notes.delete', enabled: false },
  ])
  const canUseTool = makeToolPermissionPolicy(policy)

  assert.equal(
    (await canUseTool('mcp__agentui_notes__notes_search', {}, { ...permissionOptions, agentID: 'agent-1' })).behavior,
    'allow',
  )
  assert.equal(
    (await canUseTool('mcp__agentui_notes__notes_delete', {}, { ...permissionOptions, agentID: 'agent-1' })).behavior,
    'deny',
  )
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

test('database tools validate local hosts and redact credentials', async () => {
  assert.equal(isLocalDbHost('localhost'), true)
  assert.equal(isLocalDbHost('127.0.0.1'), true)
  assert.equal(isLocalDbHost('::1'), true)
  assert.equal(isLocalDbHost('db.example.com'), false)
  assert.equal(
    redactSecretText('mongodb://user:secret@127.0.0.1:27017/app password=hunter2'),
    'mongodb://user:[redacted]@127.0.0.1:27017/app password=[redacted]',
  )

  await assert.rejects(
    () => executeMongoFind({
      connection: { uri: 'mongodb://user:secret@db.example.com:27017/app', database: 'app' },
      collection: 'users',
      filter: {},
    }),
    (error) => error instanceof DbCommandError
      && error.code === 'non_local_host'
      && !error.message.includes('secret'),
  )
  await assert.rejects(
    () => executeMongoFind({
      connection: { uri: 'mongodb://user:secret@[', database: 'app' },
      collection: 'users',
      filter: {},
    }),
    (error) => error instanceof DbCommandError
      && error.code === 'validation_failure'
      && !error.message.includes('secret'),
  )
})

test('mysql builders produce parameterized CRUD statements', () => {
  assert.deepEqual(
    buildMySqlSelect('users', {
      columns: ['id', 'email'],
      where: { status: 'active', deleted_at: null },
      orderBy: { column: 'id', direction: 'desc' },
      limit: 5,
    }),
    {
      sql: 'SELECT `id`, `email` FROM `users` WHERE `status` = ? AND `deleted_at` IS NULL ORDER BY `id` DESC LIMIT ?',
      params: ['active', 5],
    },
  )
  assert.deepEqual(
    buildMySqlInsert('users', [{ email: 'a@example.com', status: 'active' }]),
    {
      sql: 'INSERT INTO `users` (`email`, `status`) VALUES (?, ?)',
      params: ['a@example.com', 'active'],
    },
  )
  assert.deepEqual(
    buildMySqlUpdate('users', { status: 'disabled' }, { id: 7 }),
    {
      sql: 'UPDATE `users` SET `status` = ? WHERE `id` = ?',
      params: ['disabled', 7],
    },
  )
  assert.deepEqual(
    buildMySqlDelete('users', { id: 7 }),
    {
      sql: 'DELETE FROM `users` WHERE `id` = ?',
      params: [7],
    },
  )
  assert.throws(
    () => buildMySqlSelect('users;DROP', {}),
    (error) => error instanceof DbCommandError && error.code === 'validation_failure',
  )
  assert.throws(
    () => buildMySqlInsert('users', [{ profile: { nested: 'x' } } as unknown as Record<string, null>]),
    (error) => error instanceof DbCommandError && error.code === 'validation_failure',
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
      useOneMillionContext: false,
      useFastMode: false,
      autoMemoryEnabled: true,
      autoMemoryDirectory: '',
      autoDreamEnabled: false,
    },
  )

  assert.equal(options.agent, ORCHESTRATOR_AGENT_NAME)
  assert.equal(options.resume, 'existing-session-id')
  assert.deepEqual(options.tools, ['Agent', 'Read'])
  assert.deepEqual(options.skills, ['repo-scout'])
  assert.deepEqual(Object.keys(options.agents ?? {}), [ORCHESTRATOR_AGENT_NAME])
  assert.equal(options.betas, undefined)
  assert.deepEqual(options.settings, { autoMemoryEnabled: true, autoDreamEnabled: false })
})

test('query options merge auto-memory and fast-mode settings', () => {
  const options = buildQueryOptionsFromRuntime(
    {
      _id: 'conversation-1',
      model: 'claude-opus-4-7',
    },
    {
      tools: [{ id: 'read_file', enabled: true }],
      subagents: [],
      skills: [],
      useOneMillionContext: false,
      useFastMode: true,
      autoMemoryEnabled: false,
      autoMemoryDirectory: '~/agentui-memory',
      autoDreamEnabled: true,
    },
  )

  assert.deepEqual(options.settings, {
    autoMemoryEnabled: false,
    autoDreamEnabled: true,
    autoMemoryDirectory: '~/agentui-memory',
    fastMode: true,
  })
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

test('normalizes SDK memory recall messages', () => {
  const event = normalizeSdkMessage({
    type: 'system',
    subtype: 'memory_recall',
    mode: 'select',
    memories: [{ path: '/tmp/memory.md', scope: 'personal' }],
    uuid: '00000000-0000-4000-8000-000000000001',
    session_id: 'session-1',
  })

  assert.equal(event?.name, 'memory_recall')
  assert.equal(event?.data.mode, 'select')
  assert.deepEqual(event?.data.memories, [{ path: '/tmp/memory.md', scope: 'personal' }])
})
