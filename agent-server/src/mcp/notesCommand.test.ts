import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDb, disconnectDb } from '../db/connection.ts'
import { Memory } from '../db/models/Memory.ts'
import { NotesError } from '../agent/notes.ts'
import {
  NotesCommandError,
  executeNotesCreate,
  executeNotesDelete,
  executeNotesGet,
  executeNotesSearch,
  executeNotesUpdate,
} from './notesCommand.ts'

const testDbUri = `mongodb://127.0.0.1:27017/agentui-notes-mcp-test-${process.pid}`

before(async () => {
  await connectDb(testDbUri)
  await Memory.syncIndexes()
})

beforeEach(async () => {
  await Memory.deleteMany({})
})

after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase()
  await disconnectDb()
})

function noteFrom(result: Record<string, unknown>): Record<string, unknown> {
  assert.equal(typeof result.note, 'object')
  assert.notEqual(result.note, null)
  return result.note as Record<string, unknown>
}

test('Notes MCP commands create, search, get, update, and delete notes', async () => {
  const created = noteFrom(await executeNotesCreate({
    title: 'Project voice',
    content: 'Use concise implementation notes for AgentUI.',
    tags: 'style, product',
  }))

  assert.equal(created.type, 'note')
  assert.deepEqual(created.tags, ['style', 'product'])
  const id = String(created.id)

  const search = await executeNotesSearch({ search: 'implementation', limit: 5 })
  assert.equal(search.count, 1)
  const notes = search.notes as Array<Record<string, unknown>>
  assert.equal(notes[0].id, id)
  assert.equal(notes[0].snippetTruncated, false)

  const fetched = noteFrom(await executeNotesGet({ id }))
  assert.equal(fetched.content, 'Use concise implementation notes for AgentUI.')

  const updated = noteFrom(await executeNotesUpdate({
    id,
    content: 'Prefer quiet, dense UI copy.',
    type: 'instruction',
    tags: ['ui', 'copy'],
  }))
  assert.equal(updated.type, 'instruction')
  assert.deepEqual(updated.tags, ['ui', 'copy'])

  const deleted = await executeNotesDelete({ id })
  assert.equal(deleted.deleted, true)

  await assert.rejects(
    () => executeNotesGet({ id }),
    (error) => error instanceof NotesError && error.code === 'not_found',
  )
})

test('Notes MCP commands validate ids, types, no-op updates, and missing records', async () => {
  await assert.rejects(
    () => executeNotesCreate({ title: 'Bad type', content: 'x', type: 'unknown' }),
    (error) => error instanceof NotesCommandError && error.code === 'validation_failure',
  )

  await assert.rejects(
    () => executeNotesGet({ id: 'not-an-object-id' }),
    (error) => error instanceof NotesError && error.code === 'invalid_id',
  )

  const missingId = new mongoose.Types.ObjectId().toString()
  await assert.rejects(
    () => executeNotesUpdate({ id: missingId }),
    (error) => error instanceof NotesError && error.code === 'no_op',
  )

  await assert.rejects(
    () => executeNotesDelete({ id: missingId }),
    (error) => error instanceof NotesError && error.code === 'not_found',
  )
})

test('Notes MCP get caps large note content', async () => {
  const content = 'x'.repeat(13_000)
  const created = noteFrom(await executeNotesCreate({ title: 'Large note', content }))
  const fetched = noteFrom(await executeNotesGet({ id: String(created.id) }))

  assert.equal(fetched.contentTruncated, true)
  assert.equal(String(fetched.content).length, 12_000)
})
