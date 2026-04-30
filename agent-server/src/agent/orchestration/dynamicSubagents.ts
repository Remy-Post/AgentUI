import { Subagent, type SubagentDoc } from '../../db/models/Subagent.ts'
import {
  GOOGLE_WORKSPACE_SERVICES,
  type GoogleWorkspaceService,
  uniqueGoogleWorkspaceServices,
} from '../../mcp/gwsTypes.ts'
import { type DbEngine, type DbOperation, type DbToolId, dbToolId, uniqueDbToolIds } from '../../mcp/dbTypes.ts'
import { type NotesToolId, uniqueNotesToolIds } from '../../mcp/notesTypes.ts'
import { writeSubagentFile } from '../scaffold.ts'
import type { RuntimeConversation } from './options.ts'
import type { RuntimeToolPolicy } from './toolPolicy.ts'
import {
  AGENT_TOOL_NAME,
  expandToolNames,
  filterEnabledDbToolIds,
  filterEnabledNotesToolIds,
  filterEnabledSdkTools,
} from './toolPolicy.ts'
import type { RuntimeSubagentRecord } from './agents.ts'

type TaskKind = 'research' | 'code' | 'test' | 'web' | 'automation' | 'workspace' | 'database' | 'notes'

export type DynamicSubagentTask = {
  kind: TaskKind
  purpose: string
  description: string
  tools: string[]
  disallowedTools: string[]
  mcpServices?: GoogleWorkspaceService[]
  model?: string
  effort?: string
  name: string
  prompt: string
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'about',
  'please',
  'agent',
  'subagent',
  'subagents',
  'current',
  'implementation',
])

const KIND_MARKERS: Record<TaskKind, string[]> = {
  research: ['analyze', 'inspect', 'find', 'search', 'read', 'understand', 'trace', 'where', 'why', 'explain'],
  code: ['fix', 'implement', 'change', 'edit', 'update', 'add', 'refactor', 'create', 'remove'],
  test: ['test', 'typecheck', 'build', 'lint', 'verify', 'run'],
  web: [
    'web',
    'http',
    'url',
    'fetch',
    'latest',
    'current',
    'recent',
    'today',
    'news',
    'weather',
    'forecast',
    'internet',
    'search online',
  ],
  automation: ['shell', 'command', 'script', 'mongo', 'mongodb', 'database', 'sqlite', 'automation'],
  workspace: ['google workspace', 'gmail', 'google drive', 'google calendar', 'google sheets', 'google docs', 'google tasks'],
  database: ['mongo', 'mongodb', 'mysql', 'database', 'collection', 'table', 'crud'],
  notes: ['note', 'notes', 'remember', 'recall', 'forget'],
}

const WORKSPACE_SERVICE_MARKERS: Record<GoogleWorkspaceService, RegExp[]> = {
  drive: [
    /\bgoogle\s+drive\b/i,
    /\bshared\s+drive\b/i,
    /\bdrive\s+(?:file|folder|document|item|items|search|query)\b/i,
  ],
  gmail: [
    /\bgmail\b/i,
    /\bemail\b/i,
    /\binbox\b/i,
    /\bmailbox\b/i,
    /\bmail\s+(?:message|thread|search|send|reply)\b/i,
  ],
  calendar: [
    /\bgoogle\s+calendar\b/i,
    /\bcalendar\b/i,
    /\bcalendar\s+(?:event|events|invite|invites)\b/i,
    /\bschedule\s+(?:a\s+)?(?:meeting|event)\b/i,
  ],
  sheets: [
    /\bgoogle\s+sheets?\b/i,
    /\bspreadsheet(?:s)?\b/i,
    /\bsheet\s+(?:values|rows|cells|tabs|data)\b/i,
  ],
  docs: [
    /\bgoogle\s+docs?\b/i,
    /\bgoogle\s+document(?:s)?\b/i,
    /\bdocs?\s+(?:document|append|write|batchUpdate)\b/i,
  ],
  tasks: [
    /\bgoogle\s+tasks?\b/i,
    /\btask\s+list(?:s)?\b/i,
    /\btodo(?:s)?\b/i,
    /\bto-do(?:s)?\b/i,
  ],
}

const WORKSPACE_ACTION_MARKERS = [
  /\b(?:list|find|search|read|get|show|summarize|summarise|send|reply|create|update|append|write|delete|move|copy|share|schedule|complete)\b/i,
  /\b(?:google\s+workspace|gmail|google\s+drive|google\s+calendar|google\s+docs?|google\s+sheets?|google\s+tasks?|todo)\b/i,
]

const DB_ENGINE_MARKERS: Record<DbEngine, RegExp[]> = {
  mongodb: [/\bmongo(?:db)?\b/i, /\bcollection(?:s)?\b/i],
  mysql: [/\bmysql\b/i, /\bsql\s+table(?:s)?\b/i, /\btable(?:s)?\b/i],
}

const DB_OPERATION_MARKERS: Record<DbOperation, RegExp[]> = {
  read: [/\b(?:read|find|list|show|select|query|search|get|inspect|schema)\b/i],
  create: [/\b(?:create|insert|add)\b/i],
  update: [/\b(?:update|modify|patch|change)\b/i],
  delete: [/\b(?:delete|remove|drop)\b/i],
}

const DB_ACTION_MARKERS = [
  /\b(?:crud|database|mongo(?:db)?|mysql|collection(?:s)?|table(?:s)?)\b/i,
  /\b(?:read|find|list|show|select|query|insert|create|update|delete|remove)\b/i,
]

const NOTES_INTENT_MARKERS = [
  /\bnotes?\b/i,
  /\bremember(?:\s+this|\s+that|\s+the)?\b/i,
  /\brecall\s+(?:my\s+)?notes?\b/i,
  /\bforget\s+(?:this|that|note|notes?|memory)\b/i,
  /\b(?:save|store|add)\b.{0,40}\b(?:note|notes?|memory)\b/i,
]

const NOTES_OPERATION_MARKERS: Record<'read' | 'create' | 'update' | 'delete', RegExp[]> = {
  read: [/\b(?:search|find|read|list|show|recall|get|look up)\b/i],
  create: [/\b(?:remember|save|store|add|create|note down)\b/i],
  update: [/\b(?:update|modify|change|edit|revise)\b/i],
  delete: [/\b(?:delete|remove|forget)\b/i],
}

function unique<T extends string>(values: Iterable<T>): T[] {
  const out: T[] = []
  const seen = new Set<T>()
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9._-]+/g)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function slugify(value: string): string {
  const selected = words(value).slice(0, 6)
  return selected.join('_').replace(/[^a-z0-9._-]+/g, '_') || 'task'
}

function containsAny(value: string, markers: string[]): boolean {
  const lower = value.toLowerCase()
  return markers.some((marker) => lower.includes(marker))
}

function hasWorkspaceIntent(value: string): boolean {
  return WORKSPACE_ACTION_MARKERS.some((marker) => marker.test(value))
}

function hasDatabaseIntent(value: string): boolean {
  return DB_ACTION_MARKERS.some((marker) => marker.test(value))
}

function hasNotesIntent(value: string): boolean {
  return NOTES_INTENT_MARKERS.some((marker) => marker.test(value))
}

function detectWorkspaceServices(segment: string, policy: RuntimeToolPolicy): GoogleWorkspaceService[] {
  if (!hasWorkspaceIntent(segment)) return []
  const services: GoogleWorkspaceService[] = []
  for (const service of GOOGLE_WORKSPACE_SERVICES) {
    if (!policy.enabledWorkspaceServices.has(service)) continue
    if (WORKSPACE_SERVICE_MARKERS[service].some((marker) => marker.test(segment))) services.push(service)
  }
  return uniqueGoogleWorkspaceServices(services)
}

function detectDatabaseToolIds(segment: string, policy: RuntimeToolPolicy): DbToolId[] {
  if (!hasDatabaseIntent(segment)) return []
  const engines = (Object.keys(DB_ENGINE_MARKERS) as DbEngine[])
    .filter((engine) => DB_ENGINE_MARKERS[engine].some((marker) => marker.test(segment)))
  if (engines.length === 0) return []

  const operations = (Object.keys(DB_OPERATION_MARKERS) as DbOperation[])
    .filter((operation) => DB_OPERATION_MARKERS[operation].some((marker) => marker.test(segment)))
  if (/\bcrud\b/i.test(segment)) operations.push('read', 'create', 'update', 'delete')
  if (operations.length === 0) operations.push('read')

  return uniqueDbToolIds(
    engines.flatMap((engine) => operations.map((operation) => dbToolId(engine, operation)))
      .filter((toolId) => policy.enabledDbToolIds.has(toolId)),
  )
}

function detectNotesToolIds(segment: string, policy: RuntimeToolPolicy): NotesToolId[] {
  if (!hasNotesIntent(segment)) return []
  const tools: NotesToolId[] = []
  if (NOTES_OPERATION_MARKERS.read.some((marker) => marker.test(segment))) tools.push('notes.read')
  if (NOTES_OPERATION_MARKERS.create.some((marker) => marker.test(segment))) tools.push('notes.create')
  if (NOTES_OPERATION_MARKERS.update.some((marker) => marker.test(segment))) tools.push('notes.update')
  if (NOTES_OPERATION_MARKERS.delete.some((marker) => marker.test(segment))) tools.push('notes.delete')
  if ((tools.includes('notes.update') || tools.includes('notes.delete')) && !tools.includes('notes.read')) {
    tools.unshift('notes.read')
  }
  if (tools.length === 0) tools.push('notes.read')
  return filterEnabledNotesToolIds(uniqueNotesToolIds(tools), policy)
}

function stripBullet(value: string): string {
  return value.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim()
}

function splitTaskSegments(content: string): string[] {
  const rawLines = content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const lines = rawLines
    .map(stripBullet)
    .filter((line) => line.length > 0)

  const bulletLike = rawLines
    .filter((line) => /^(?:[-*]|\d+[.)])\s+/.test(line))
    .map(stripBullet)
  if (bulletLike.length > 1) return bulletLike.slice(0, 6)
  if (lines.length > 1) return lines.slice(0, 6)

  const semicolonParts = content
    .split(/[;\n]+/g)
    .map(stripBullet)
    .filter((part) => part.length > 18)
  if (semicolonParts.length > 1) return semicolonParts.slice(0, 6)

  return [content.trim()].filter(Boolean)
}

function classifyKinds(segment: string): TaskKind[] {
  const kinds: TaskKind[] = []
  if (containsAny(segment, KIND_MARKERS.web)) kinds.push('web')
  if (containsAny(segment, KIND_MARKERS.database)) kinds.push('database')
  if (containsAny(segment, KIND_MARKERS.code)) kinds.push('code')
  if (containsAny(segment, KIND_MARKERS.test)) kinds.push('test')
  if (containsAny(segment, KIND_MARKERS.automation)) kinds.push('automation')
  if (containsAny(segment, KIND_MARKERS.research)) kinds.push('research')
  return unique(kinds)
}

function requiredTools(kind: TaskKind, purpose: string): string[] {
  switch (kind) {
    case 'database':
    case 'notes':
      return []
    case 'code':
      return /\b(?:new file|create|scaffold|add)\b/i.test(purpose)
        ? ['Read', 'Grep', 'Glob', 'Edit', 'MultiEdit', 'Write']
        : ['Read', 'Grep', 'Glob', 'Edit', 'MultiEdit']
    case 'test':
      return ['Read', 'Grep', 'Glob', 'Bash']
    case 'web':
      return ['WebSearch', 'WebFetch']
    case 'automation':
      return containsAny(purpose, KIND_MARKERS.web)
        ? ['Read', 'Grep', 'Glob', 'Bash', 'WebSearch', 'WebFetch']
        : ['Read', 'Grep', 'Glob', 'Bash']
    case 'research':
    default:
      return ['Read', 'Grep', 'Glob']
  }
}

function serviceLabel(service: GoogleWorkspaceService): string {
  switch (service) {
    case 'drive':
      return 'Google Drive'
    case 'gmail':
      return 'Gmail'
    case 'calendar':
      return 'Google Calendar'
    case 'sheets':
      return 'Google Sheets'
    case 'docs':
      return 'Google Docs'
    case 'tasks':
      return 'Google Tasks'
  }
}

function taskDescription(kind: TaskKind, purpose: string, service?: GoogleWorkspaceService): string {
  if (kind === 'workspace' && service) {
    return `Scoped ${serviceLabel(service)} subagent for: ${purpose.slice(0, 140)}`
  }
  if (kind === 'database') return `Scoped database subagent for: ${purpose.slice(0, 140)}`
  if (kind === 'notes') return `Scoped Notes subagent for: ${purpose.slice(0, 140)}`
  return `Scoped ${kind} subagent for: ${purpose.slice(0, 140)}`
}

function taskPrompt(
  kind: TaskKind,
  purpose: string,
  tools: string[],
  mcpServices: GoogleWorkspaceService[] = [],
): string {
  const workspaceLine = mcpServices.length > 0
    ? `Available Google Workspace services for this task only: ${mcpServices.map(serviceLabel).join(', ')}.`
    : null
  return [
    'You are an AgentUI dynamic subagent.',
    `Your single purpose is: ${purpose}`,
    `Task type: ${kind}.`,
    `Available tools for this task only: ${tools.join(', ') || 'none'}.`,
    workspaceLine,
    'Do not solve unrelated issues or broaden the task.',
    'Use only the minimum context needed.',
    'For current, latest, weather, news, personal workspace, database, or other tool-backed data, return only facts found through your available tools.',
    'If the required tool or connector is disabled, unavailable, unauthenticated, or returns no usable result, report that blocker instead of guessing.',
    'Return concise findings, changes, verification, and any blocked/unsafe action.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function taskModel(kind: TaskKind, conversation: RuntimeConversation): string | undefined {
  if (kind === 'test') return 'claude-haiku-4-5-20251001'
  return conversation.model
}

function taskEffort(kind: TaskKind): string {
  return kind === 'test' ? 'low' : 'medium'
}

function planCap(effort: 'low' | 'medium' | 'high' | undefined): number {
  if (effort === 'low') return 3
  if (effort === 'high') return Number.POSITIVE_INFINITY
  return 7
}

function buildWorkspaceTask(
  service: GoogleWorkspaceService,
  purpose: string,
  policy: RuntimeToolPolicy,
  conversation: RuntimeConversation,
): DynamicSubagentTask | null {
  if (!policy.enabledWorkspaceServices.has(service)) return null

  const mcpServices = [service]
  const disallowedTools = unique([...Array.from(policy.enabledSdkTools), AGENT_TOOL_NAME])
  const slug = slugify(purpose)
  const name = `agentui_workspace_${service}_${slug}`.slice(0, 80)

  return {
    kind: 'workspace',
    purpose,
    description: taskDescription('workspace', purpose, service),
    tools: [],
    disallowedTools,
    mcpServices,
    model: conversation.model,
    effort: 'medium',
    name,
    prompt: taskPrompt('workspace', purpose, [], mcpServices),
  }
}

function buildTask(kind: TaskKind, purpose: string, policy: RuntimeToolPolicy, conversation: RuntimeConversation): DynamicSubagentTask | null {
  if (kind === 'workspace' || kind === 'database') return null
  const tools = filterEnabledSdkTools(requiredTools(kind, purpose), policy)
  if (tools.length === 0) return null

  const disallowedTools = unique([
    ...Array.from(policy.enabledSdkTools).filter((tool) => !tools.includes(tool)),
    AGENT_TOOL_NAME,
  ])
  const slug = slugify(purpose)
  const name = `agentui_${kind}_${slug}`.slice(0, 80)

  return {
    kind,
    purpose,
    description: taskDescription(kind, purpose),
    tools,
    disallowedTools,
    model: taskModel(kind, conversation),
    effort: taskEffort(kind),
    name,
    prompt: taskPrompt(kind, purpose, tools),
  }
}

function buildDatabaseTask(
  purpose: string,
  toolIds: DbToolId[],
  policy: RuntimeToolPolicy,
  conversation: RuntimeConversation,
): DynamicSubagentTask | null {
  const tools = filterEnabledDbToolIds(toolIds, policy)
  if (tools.length === 0) return null

  const disallowedTools = unique([...Array.from(policy.enabledSdkTools), AGENT_TOOL_NAME])
  const slug = slugify(purpose)
  const name = `agentui_database_${slug}`.slice(0, 80)

  return {
    kind: 'database',
    purpose,
    description: taskDescription('database', purpose),
    tools,
    disallowedTools,
    model: conversation.model,
    effort: 'medium',
    name,
    prompt: taskPrompt('database', purpose, tools),
  }
}

function buildNotesTask(
  purpose: string,
  toolIds: NotesToolId[],
  policy: RuntimeToolPolicy,
  conversation: RuntimeConversation,
): DynamicSubagentTask | null {
  const tools = filterEnabledNotesToolIds(toolIds, policy)
  if (tools.length === 0) return null

  const disallowedTools = unique([...Array.from(policy.enabledSdkTools), AGENT_TOOL_NAME])
  const slug = slugify(purpose)
  const name = `agentui_notes_${slug}`.slice(0, 80)

  return {
    kind: 'notes',
    purpose,
    description: taskDescription('notes', purpose),
    tools,
    disallowedTools,
    model: conversation.model,
    effort: 'medium',
    name,
    prompt: taskPrompt('notes', purpose, tools),
  }
}

export function planDynamicSubagentTasks(
  content: string,
  policy: RuntimeToolPolicy,
  conversation: RuntimeConversation,
): DynamicSubagentTask[] {
  const tasks: DynamicSubagentTask[] = []
  const seen = new Set<string>()

  for (const segment of splitTaskSegments(content)) {
    const workspaceServices = detectWorkspaceServices(segment, policy)
    if (workspaceServices.length > 0) {
      for (const service of workspaceServices) {
        const task = buildWorkspaceTask(service, segment, policy, conversation)
        if (!task) continue
        const key = `${task.kind}:${service}:${slugify(task.purpose)}`
        if (seen.has(key)) continue
        seen.add(key)
        tasks.push(task)
      }
      continue
    }

    const notesToolIds = detectNotesToolIds(segment, policy)
    if (notesToolIds.length > 0) {
      const task = buildNotesTask(segment, notesToolIds, policy, conversation)
      if (task) {
        const key = `${task.kind}:${task.tools.join(',')}:${slugify(task.purpose)}`
        if (!seen.has(key)) {
          seen.add(key)
          tasks.push(task)
        }
      }
      continue
    }

    const dbToolIds = detectDatabaseToolIds(segment, policy)
    if (dbToolIds.length > 0) {
      const task = buildDatabaseTask(segment, dbToolIds, policy, conversation)
      if (task) {
        const key = `${task.kind}:${task.tools.join(',')}:${slugify(task.purpose)}`
        if (!seen.has(key)) {
          seen.add(key)
          tasks.push(task)
        }
      }
      continue
    }

    for (const kind of classifyKinds(segment)) {
      const task = buildTask(kind, segment, policy, conversation)
      if (!task) continue
      const key = `${task.kind}:${slugify(task.purpose)}`
      if (seen.has(key)) continue
      seen.add(key)
      tasks.push(task)
    }
  }

  return tasks.slice(0, planCap(conversation.effort))
}

function tokenOverlapScore(left: string, right: string): number {
  const leftWords = new Set(words(left))
  const rightWords = new Set(words(right))
  if (leftWords.size === 0 || rightWords.size === 0) return 0
  let overlap = 0
  for (const word of leftWords) {
    if (rightWords.has(word)) overlap += 1
  }
  return overlap / Math.min(leftWords.size, rightWords.size)
}

function hasRequiredTools(candidate: RuntimeSubagentRecord, task: DynamicSubagentTask): boolean {
  if (task.tools.length === 0) return true
  const taskNotesTools = uniqueNotesToolIds(task.tools)
  if (taskNotesTools.length > 0) {
    const candidateNotesTools = uniqueNotesToolIds(candidate.tools)
    if (!Array.isArray(candidate.tools)) return true
    return taskNotesTools.every((tool) => candidateNotesTools.includes(tool))
  }
  const taskDbTools = uniqueDbToolIds(task.tools)
  if (taskDbTools.length > 0) {
    const candidateDbTools = new Set(uniqueDbToolIds(candidate.tools))
    return taskDbTools.every((tool) => candidateDbTools.has(tool))
  }
  const candidateTools = new Set(expandToolNames(candidate.tools))
  if (candidateTools.size === 0) return false
  return task.tools.every((tool) => candidateTools.has(tool))
}

function hasSameMcpServices(candidate: RuntimeSubagentRecord, task: DynamicSubagentTask): boolean {
  const candidateServices = uniqueGoogleWorkspaceServices(candidate.mcpServices).sort()
  const taskServices = uniqueGoogleWorkspaceServices(task.mcpServices).sort()
  if (candidateServices.length !== taskServices.length) return false
  return taskServices.every((service, index) => candidateServices[index] === service)
}

function isSuitableSubagent(candidate: RuntimeSubagentRecord, task: DynamicSubagentTask): boolean {
  if (!hasSameMcpServices(candidate, task)) return false
  if (!hasRequiredTools(candidate, task)) return false
  const haystack = `${candidate.name} ${candidate.description} ${candidate.prompt}`
  if (task.mcpServices?.some((service) => haystack.toLowerCase().includes(service))) return true
  if (candidate.name === task.name) return true
  if (candidate.name.startsWith(`agentui_${task.kind}_`) && tokenOverlapScore(haystack, task.purpose) >= 0.25) {
    return true
  }
  return tokenOverlapScore(haystack, `${task.kind} ${task.purpose}`) >= 0.35
}

function toRuntimeSubagentRecord(doc: SubagentDoc): RuntimeSubagentRecord {
  return {
    _id: doc._id,
    name: doc.name,
    description: doc.description,
    prompt: doc.prompt,
    model: doc.model ?? undefined,
    effort: doc.effort ?? undefined,
    permissionMode: doc.permissionMode ?? undefined,
    tools: doc.tools ?? undefined,
    disallowedTools: doc.disallowedTools ?? undefined,
    mcpServices: uniqueGoogleWorkspaceServices(doc.mcpServices),
    memory:
      doc.memory === 'user' || doc.memory === 'project' || doc.memory === 'local' || doc.memory === 'none'
        ? doc.memory
        : undefined,
  }
}

async function uniqueDynamicName(baseName: string): Promise<string> {
  let name = baseName
  let suffix = 2
  while (await Subagent.exists({ name })) {
    name = `${baseName.slice(0, 72)}_${suffix}`
    suffix += 1
  }
  return name
}

async function createDynamicSubagent(task: DynamicSubagentTask): Promise<RuntimeSubagentRecord> {
  const name = await uniqueDynamicName(task.name)
  const doc = await Subagent.create({
    name,
    description: task.description,
    prompt: task.prompt,
    model: task.model,
    effort: task.effort,
    permissionMode: 'dontAsk',
    tools: task.tools,
    disallowedTools: task.disallowedTools,
    mcpServices: task.mcpServices,
    memory: 'local',
    enabled: true,
  })
  await writeSubagentFile(doc)
  return toRuntimeSubagentRecord(doc)
}

export async function ensureTurnSubagents(
  content: string,
  conversation: RuntimeConversation,
  candidates: RuntimeSubagentRecord[],
  policy: RuntimeToolPolicy,
): Promise<RuntimeSubagentRecord[]> {
  const tasks = planDynamicSubagentTasks(content, policy, conversation)
  const selected: RuntimeSubagentRecord[] = []

  for (const task of tasks) {
    const existing = [...selected, ...candidates].find((candidate) => isSuitableSubagent(candidate, task))
    if (existing) {
      selected.push(existing)
      continue
    }

    selected.push(await createDynamicSubagent(task))
  }

  return unique(selected.map((agent) => agent.name))
    .map((name) => selected.find((agent) => agent.name === name))
    .filter((agent): agent is RuntimeSubagentRecord => Boolean(agent))
}
