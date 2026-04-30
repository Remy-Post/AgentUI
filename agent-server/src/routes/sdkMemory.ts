import { Router } from 'express'
import type { Response } from 'express'
import { Settings } from '../db/models/Settings.ts'
import {
  SdkMemoryError,
  deleteSdkMemoryFile,
  listSdkMemory,
  readSdkMemoryFile,
  writeSdkMemoryFile,
} from '../agent/sdkMemory.ts'
import type { UpdateSdkMemoryFileRequest } from '../shared/types.ts'

const router = Router()

type MemorySettingsLean = {
  autoMemoryDirectory?: string
}

async function loadMemorySettings(): Promise<MemorySettingsLean> {
  const doc = await Settings.findOne({ key: 'global' }).lean<MemorySettingsLean | null>()
  return {
    autoMemoryDirectory: typeof doc?.autoMemoryDirectory === 'string' ? doc.autoMemoryDirectory : '',
  }
}

function statusFor(error: SdkMemoryError): number {
  if (error.code === 'not_found') return 404
  if (error.code === 'file_too_large') return 413
  return 400
}

function sendMemoryError(res: Response, error: unknown): void {
  if (error instanceof SdkMemoryError) {
    res.status(statusFor(error)).json({ error: error.code, message: error.message })
    return
  }
  const message = error instanceof Error ? error.message : 'sdk_memory_failed'
  res.status(500).json({ error: 'sdk_memory_failed', message })
}

function fileInput(req: {
  query: Record<string, unknown>
}): { scope: unknown; agentName?: unknown; relativePath?: unknown } {
  return {
    scope: req.query.scope,
    agentName: req.query.agentName,
    relativePath: req.query.path,
  }
}

router.get('/', async (_req, res) => {
  try {
    return res.json(await listSdkMemory(await loadMemorySettings()))
  } catch (error) {
    return sendMemoryError(res, error)
  }
})

router.get('/file', async (req, res) => {
  try {
    return res.json(await readSdkMemoryFile(fileInput(req), await loadMemorySettings()))
  } catch (error) {
    return sendMemoryError(res, error)
  }
})

router.put('/file', async (req, res) => {
  const body = (req.body ?? {}) as UpdateSdkMemoryFileRequest
  try {
    return res.json(
      await writeSdkMemoryFile(
        {
          ...fileInput(req),
          content: body.content,
        },
        await loadMemorySettings(),
      ),
    )
  } catch (error) {
    return sendMemoryError(res, error)
  }
})

router.delete('/file', async (req, res) => {
  try {
    await deleteSdkMemoryFile(fileInput(req), await loadMemorySettings())
    return res.status(204).end()
  } catch (error) {
    return sendMemoryError(res, error)
  }
})

export default router
