import { Tool } from '../../db/models/Tool.ts'

export type ToolKind = 'sdk' | 'mcp' | 'compatibility'

export type ToolCategory =
  | 'quick'
  | 'orchestration'
  | 'computer'
  | 'planning'
  | 'worktrees'
  | 'notebooks'
  | 'web'
  | 'schedules'
  | 'tasks'
  | 'mcp'
  | 'google-suite'
  | 'database'
  | 'source-control'
  | 'other'

export type ToolCatalogEntry = {
  id: string
  label: string
  description: string
  enabled: boolean
  category: ToolCategory
  kind: ToolKind
  order: number
  quickRank?: number
  locked?: boolean
  permission?: string
}

export const LEGACY_TOOL_ALIASES: Record<string, string[]> = {
  read_file: ['Read'],
  edit_file: ['Edit', 'Write', 'MultiEdit'],
  grep: ['Grep'],
  list_files: ['Glob'],
  'shell.exec': ['Bash'],
  'web.fetch': ['WebFetch'],
  'web.search': ['WebSearch'],
}

export const DEFAULT_TOOLS: ToolCatalogEntry[] = [
  {
    id: 'Agent',
    label: 'Agent',
    description: 'Spawn scoped subagents with their own context windows.',
    enabled: true,
    category: 'orchestration',
    kind: 'sdk',
    order: 10,
    locked: true,
    permission: 'Required by AgentUI orchestration.',
  },
  {
    id: 'AskUserQuestion',
    label: 'Ask user question',
    description: 'Ask multiple-choice questions to clarify ambiguity.',
    enabled: false,
    category: 'orchestration',
    kind: 'sdk',
    order: 20,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'Read',
    label: 'Read files',
    description: 'Read file contents from the workspace.',
    enabled: true,
    category: 'computer',
    kind: 'sdk',
    order: 100,
    quickRank: 2,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'Glob',
    label: 'Find files',
    description: 'Find files by pattern in the workspace.',
    enabled: true,
    category: 'computer',
    kind: 'sdk',
    order: 110,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'Grep',
    label: 'Search files',
    description: 'Search file contents for patterns.',
    enabled: true,
    category: 'computer',
    kind: 'sdk',
    order: 120,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'Edit',
    label: 'Edit files',
    description: 'Apply targeted edits to existing files.',
    enabled: true,
    category: 'computer',
    kind: 'sdk',
    order: 130,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'MultiEdit',
    label: 'Multi-edit files',
    description: 'Apply multiple targeted edits to one file.',
    enabled: true,
    category: 'computer',
    kind: 'sdk',
    order: 140,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'Write',
    label: 'Write files',
    description: 'Create or overwrite files.',
    enabled: true,
    category: 'computer',
    kind: 'sdk',
    order: 150,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'Bash',
    label: 'Bash',
    description: 'Execute shell commands in the workspace.',
    enabled: false,
    category: 'computer',
    kind: 'sdk',
    order: 160,
    quickRank: 1,
    permission: 'Requires permission in Claude Code and AgentUI safety checks.',
  },
  {
    id: 'PowerShell',
    label: 'PowerShell',
    description: 'Execute PowerShell commands natively when available.',
    enabled: false,
    category: 'computer',
    kind: 'sdk',
    order: 170,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'Monitor',
    label: 'Monitor',
    description: 'Run a background command and react to output lines.',
    enabled: false,
    category: 'computer',
    kind: 'sdk',
    order: 180,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'LSP',
    label: 'LSP',
    description: 'Use language-server code intelligence when configured.',
    enabled: false,
    category: 'computer',
    kind: 'sdk',
    order: 190,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'WebFetch',
    label: 'Web fetch',
    description: 'Fetch content from a specified URL.',
    enabled: true,
    category: 'web',
    kind: 'sdk',
    order: 300,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'WebSearch',
    label: 'Web search',
    description: 'Search the web for information.',
    enabled: true,
    category: 'web',
    kind: 'sdk',
    order: 310,
    quickRank: 3,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'EnterPlanMode',
    label: 'Enter plan mode',
    description: 'Switch to planning mode before implementation.',
    enabled: false,
    category: 'planning',
    kind: 'sdk',
    order: 400,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'ExitPlanMode',
    label: 'Exit plan mode',
    description: 'Present a plan for approval and exit planning mode.',
    enabled: false,
    category: 'planning',
    kind: 'sdk',
    order: 410,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'EnterWorktree',
    label: 'Enter worktree',
    description: 'Create or switch into an isolated git worktree.',
    enabled: false,
    category: 'worktrees',
    kind: 'sdk',
    order: 500,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'ExitWorktree',
    label: 'Exit worktree',
    description: 'Return from a worktree session to the original directory.',
    enabled: false,
    category: 'worktrees',
    kind: 'sdk',
    order: 510,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'NotebookEdit',
    label: 'Notebook edit',
    description: 'Modify Jupyter notebook cells.',
    enabled: false,
    category: 'notebooks',
    kind: 'sdk',
    order: 600,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'CronCreate',
    label: 'Schedule task',
    description: 'Schedule a recurring or one-shot session prompt.',
    enabled: false,
    category: 'schedules',
    kind: 'sdk',
    order: 700,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'CronList',
    label: 'List schedules',
    description: 'List scheduled tasks in the current session.',
    enabled: false,
    category: 'schedules',
    kind: 'sdk',
    order: 710,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'CronDelete',
    label: 'Delete schedule',
    description: 'Cancel a scheduled task by ID.',
    enabled: false,
    category: 'schedules',
    kind: 'sdk',
    order: 720,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'TodoWrite',
    label: 'Todo write',
    description: 'Manage the session task checklist in the Agent SDK.',
    enabled: true,
    category: 'tasks',
    kind: 'sdk',
    order: 800,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'TaskCreate',
    label: 'Create task',
    description: 'Create a task in the interactive task list.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 810,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'TaskGet',
    label: 'Get task',
    description: 'Retrieve details for a task.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 820,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'TaskList',
    label: 'List tasks',
    description: 'List tasks and their current status.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 830,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'TaskUpdate',
    label: 'Update task',
    description: 'Update task status, dependencies, details, or delete tasks.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 840,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'TaskOutput',
    label: 'Task output',
    description: 'Deprecated background task output reader.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 850,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'TaskStop',
    label: 'Stop task',
    description: 'Stop a running background task by ID.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 860,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'TeamCreate',
    label: 'Create team',
    description: 'Create an experimental agent team when enabled.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 870,
    permission: 'Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.',
  },
  {
    id: 'SendMessage',
    label: 'Send teammate message',
    description: 'Message an agent-team teammate or resume a subagent.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 880,
    permission: 'Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.',
  },
  {
    id: 'TeamDelete',
    label: 'Delete team',
    description: 'Disband an experimental agent team.',
    enabled: false,
    category: 'tasks',
    kind: 'sdk',
    order: 890,
    permission: 'Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.',
  },
  {
    id: 'ListMcpResourcesTool',
    label: 'List MCP resources',
    description: 'List resources exposed by connected MCP servers.',
    enabled: false,
    category: 'mcp',
    kind: 'sdk',
    order: 900,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'ReadMcpResourceTool',
    label: 'Read MCP resource',
    description: 'Read a specific MCP resource by URI.',
    enabled: false,
    category: 'mcp',
    kind: 'sdk',
    order: 910,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'ToolSearch',
    label: 'Tool search',
    description: 'Search for and load deferred tools when tool search is enabled.',
    enabled: false,
    category: 'mcp',
    kind: 'sdk',
    order: 920,
    permission: 'No permission prompt required by Claude Code.',
  },
  {
    id: 'Skill',
    label: 'Skill',
    description: 'Execute an enabled Claude skill.',
    enabled: true,
    category: 'mcp',
    kind: 'sdk',
    order: 930,
    permission: 'Requires permission in Claude Code.',
  },
  {
    id: 'google.workspace.drive',
    label: 'Google Drive',
    description: 'Allow scoped Google Drive access through AgentUI MCP subagents.',
    enabled: false,
    category: 'google-suite',
    kind: 'mcp',
    order: 1000,
  },
  {
    id: 'google.workspace.gmail',
    label: 'Gmail',
    description: 'Allow scoped Gmail access through AgentUI MCP subagents.',
    enabled: false,
    category: 'google-suite',
    kind: 'mcp',
    order: 1010,
  },
  {
    id: 'google.workspace.calendar',
    label: 'Google Calendar',
    description: 'Allow scoped Google Calendar access through AgentUI MCP subagents.',
    enabled: false,
    category: 'google-suite',
    kind: 'mcp',
    order: 1020,
  },
  {
    id: 'google.workspace.sheets',
    label: 'Google Sheets',
    description: 'Allow scoped Google Sheets access through AgentUI MCP subagents.',
    enabled: false,
    category: 'google-suite',
    kind: 'mcp',
    order: 1030,
  },
  {
    id: 'google.workspace.docs',
    label: 'Google Docs',
    description: 'Allow scoped Google Docs access through AgentUI MCP subagents.',
    enabled: false,
    category: 'google-suite',
    kind: 'mcp',
    order: 1040,
  },
  {
    id: 'google.workspace.tasks',
    label: 'Google Tasks',
    description: 'Allow scoped Google Tasks access through AgentUI MCP subagents.',
    enabled: false,
    category: 'google-suite',
    kind: 'mcp',
    order: 1050,
  },
  {
    id: 'mongodb.read',
    label: 'MongoDB read',
    description: 'List collections and find documents in local MongoDB databases.',
    enabled: false,
    category: 'database',
    kind: 'mcp',
    order: 1100,
  },
  {
    id: 'mongodb.create',
    label: 'MongoDB create',
    description: 'Insert documents into local MongoDB databases.',
    enabled: false,
    category: 'database',
    kind: 'mcp',
    order: 1110,
  },
  {
    id: 'mongodb.update',
    label: 'MongoDB update',
    description: 'Update documents in local MongoDB databases.',
    enabled: false,
    category: 'database',
    kind: 'mcp',
    order: 1120,
  },
  {
    id: 'mongodb.delete',
    label: 'MongoDB delete',
    description: 'Delete documents from local MongoDB databases.',
    enabled: false,
    category: 'database',
    kind: 'mcp',
    order: 1130,
  },
  {
    id: 'mysql.read',
    label: 'MySQL read',
    description: 'List tables and select rows from local MySQL databases.',
    enabled: false,
    category: 'database',
    kind: 'mcp',
    order: 1140,
  },
  {
    id: 'mysql.create',
    label: 'MySQL create',
    description: 'Insert rows into local MySQL databases.',
    enabled: false,
    category: 'database',
    kind: 'mcp',
    order: 1150,
  },
  {
    id: 'mysql.update',
    label: 'MySQL update',
    description: 'Update rows in local MySQL databases.',
    enabled: false,
    category: 'database',
    kind: 'mcp',
    order: 1160,
  },
  {
    id: 'mysql.delete',
    label: 'MySQL delete',
    description: 'Delete rows from local MySQL databases.',
    enabled: false,
    category: 'database',
    kind: 'mcp',
    order: 1170,
  },
  {
    id: 'git.commit',
    label: 'Git commit',
    description: 'Compatibility toggle for commit workflows; direct git commits remain safety-gated.',
    enabled: false,
    category: 'source-control',
    kind: 'compatibility',
    order: 1200,
  },
  {
    id: 'sqlite.query',
    label: 'SQLite query',
    description: 'Compatibility toggle for local SQLite query workflows.',
    enabled: false,
    category: 'database',
    kind: 'compatibility',
    order: 1210,
  },
]

const CATALOG_BY_ID = new Map(DEFAULT_TOOLS.map((tool) => [tool.id, tool]))
const LEGACY_IDS = Object.keys(LEGACY_TOOL_ALIASES)

export function toolCatalogEntry(id: string): ToolCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id)
}

export function isLockedTool(id: string): boolean {
  return CATALOG_BY_ID.get(id)?.locked === true
}

type LegacyToolDoc = {
  id: string
  enabled?: boolean
}

function enabledFromLegacyAliases(id: string, docs: LegacyToolDoc[]): boolean | undefined {
  const states: boolean[] = []
  for (const [legacyId, canonicalIds] of Object.entries(LEGACY_TOOL_ALIASES)) {
    if (!canonicalIds.includes(id)) continue
    const doc = docs.find((tool) => tool.id === legacyId)
    if (doc) states.push(doc.enabled !== false)
  }
  if (states.length === 0) return undefined
  return states.some(Boolean)
}

export function buildToolRegistryUpsert(tool: ToolCatalogEntry, enabled = tool.enabled) {
  const metadata = {
    label: tool.label,
    description: tool.description,
    category: tool.category,
    kind: tool.kind,
    order: tool.order,
    quickRank: tool.quickRank,
    locked: tool.locked === true,
    permission: tool.permission,
  }
  const setFields: Record<string, unknown> = { ...metadata }
  const setOnInsert: { id: string; enabled?: boolean } = { id: tool.id }

  if (tool.locked) {
    setFields.enabled = true
  } else {
    setOnInsert.enabled = enabled
  }

  return {
    updateOne: {
      filter: { id: tool.id },
      update: {
        $set: setFields,
        $setOnInsert: setOnInsert,
      },
      upsert: true,
    },
  }
}

export async function ensureToolRegistrySeeded(): Promise<void> {
  const legacyDocs = (await Tool.find({ id: { $in: LEGACY_IDS } }).lean()) as unknown as LegacyToolDoc[]

  await Tool.bulkWrite(
    DEFAULT_TOOLS.map((tool) => {
      const inheritedEnabled = enabledFromLegacyAliases(tool.id, legacyDocs)
      const enabled = inheritedEnabled ?? tool.enabled
      return buildToolRegistryUpsert(tool, enabled)
    }),
  )

  if (legacyDocs.length > 0) await Tool.deleteMany({ id: { $in: LEGACY_IDS } })
}
