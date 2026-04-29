import { Tool } from '../../db/models/Tool.ts'

export const DEFAULT_TOOLS: Array<{ id: string; description: string; enabled: boolean }> = [
  { id: 'read_file', description: 'Read file contents from the workspace.', enabled: true },
  { id: 'edit_file', description: 'Apply targeted edits to existing files.', enabled: true },
  { id: 'grep', description: 'Search file contents for patterns.', enabled: true },
  { id: 'list_files', description: 'Enumerate files and directories.', enabled: true },
  { id: 'shell.exec', description: 'Run shell commands in the workspace.', enabled: false },
  { id: 'web.fetch', description: 'Fetch HTTP resources.', enabled: true },
  { id: 'web.search', description: 'Search the web for information.', enabled: true },
  { id: 'git.commit', description: 'Stage and commit changes via git.', enabled: false },
  { id: 'sqlite.query', description: 'Run SQL queries against local SQLite databases.', enabled: false },
  { id: 'google.workspace.drive', description: 'Allow scoped Google Drive access through AgentUI MCP subagents.', enabled: false },
  { id: 'google.workspace.gmail', description: 'Allow scoped Gmail access through AgentUI MCP subagents.', enabled: false },
  { id: 'google.workspace.calendar', description: 'Allow scoped Google Calendar access through AgentUI MCP subagents.', enabled: false },
  { id: 'google.workspace.sheets', description: 'Allow scoped Google Sheets access through AgentUI MCP subagents.', enabled: false },
  { id: 'google.workspace.docs', description: 'Allow scoped Google Docs access through AgentUI MCP subagents.', enabled: false },
  { id: 'google.workspace.tasks', description: 'Allow scoped Google Tasks access through AgentUI MCP subagents.', enabled: false },
]

export async function ensureToolRegistrySeeded(): Promise<void> {
  await Tool.bulkWrite(
    DEFAULT_TOOLS.map((tool) => ({
      updateOne: {
        filter: { id: tool.id },
        update: { $setOnInsert: tool },
        upsert: true,
      },
    })),
  )
}
