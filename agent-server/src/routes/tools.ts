import { Router } from 'express'
import { Tool } from '../db/models/Tool.ts'

const router = Router()

const DEFAULT_TOOLS: Array<{ id: string; description: string; enabled: boolean }> = [
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

async function ensureSeeded(): Promise<void> {
  const count = await Tool.countDocuments()
  if (count === 0) {
    await Tool.insertMany(DEFAULT_TOOLS)
  }
}

type ToolLean = { id: string; description?: string; enabled: boolean }

router.get('/', async (_req, res) => {
  await ensureSeeded()
  const docs = (await Tool.find().sort({ id: 1 }).lean()) as unknown as ToolLean[]
  return res.json(docs.map((d) => ({ id: d.id, description: d.description ?? '', enabled: d.enabled })))
})

router.patch('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  if (typeof body.description === 'string') update.description = body.description
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })

  const doc = (await Tool.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true }).lean()) as unknown as ToolLean | null
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json({ id: doc.id, description: doc.description ?? '', enabled: doc.enabled })
})

export default router
