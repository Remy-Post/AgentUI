import { Router } from 'express'
import type { Response } from 'express'
import mongoose from 'mongoose'
import {
  NotesError,
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from '../agent/notes.ts'
import type { UpdateMemoryRequest } from '../shared/types.ts'

const router = Router()

function sendUnexpectedError(res: Response, error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[memories] ${fallback}:`, message)
  res.status(500).json({ error: fallback })
}

function sendNotesError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof NotesError) {
    res.status(error.status).json({ error: error.code })
    return
  }
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: 'validation_failed' })
    return
  }
  sendUnexpectedError(res, error, fallback)
}

router.get('/', async (req, res) => {
  try {
    return res.json(await listNotes(req.query))
  } catch (error) {
    return sendNotesError(res, error, 'list_failed')
  }
})

router.post('/', async (req, res) => {
  try {
    const doc = await createNote((req.body ?? {}) as Record<string, unknown>)
    return res.status(201).json(doc)
  } catch (error) {
    return sendNotesError(res, error, 'create_failed')
  }
})

router.patch('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown> & UpdateMemoryRequest

  try {
    return res.json(await updateNote(req.params.id, body))
  } catch (error) {
    return sendNotesError(res, error, 'update_failed')
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await deleteNote(req.params.id)
    return res.status(204).end()
  } catch (error) {
    return sendNotesError(res, error, 'delete_failed')
  }
})

export default router
