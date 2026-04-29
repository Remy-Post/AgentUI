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
]

export async function ensureToolRegistrySeeded(): Promise<void> {
  const count = await Tool.countDocuments()
  if (count === 0) {
    await Tool.insertMany(DEFAULT_TOOLS)
  }
}
