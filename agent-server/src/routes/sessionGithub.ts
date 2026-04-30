import { Router } from 'express'
import mongoose from 'mongoose'
import { Conversation } from '../db/models/Conversation.ts'
import { GitHubContextError } from '../github/core.ts'
import { ingestGitHubRepository, previewGitHubRepository } from '../github/service.ts'
import type { GitHubIngestDTO, GitHubIngestRequest, GitHubPreviewDTO, GitHubPreviewRequest } from '../shared/types.ts'

const router = Router({ mergeParams: true })

function sendError(res: import('express').Response, error: unknown): void {
  if (error instanceof GitHubContextError) {
    res.status(error.status).json({ error: error.code, message: error.message })
    return
  }
  const message = error instanceof Error ? error.message : 'github_failed'
  res.status(500).json({ error: 'github_failed', message })
}

router.post<'/preview', { id: string }>('/preview', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  if (!(await Conversation.exists({ _id: req.params.id }))) return res.status(404).json({ error: 'not_found' })
  const body = (req.body ?? {}) as GitHubPreviewRequest
  try {
    const dto: GitHubPreviewDTO = await previewGitHubRepository(body.url, body.ref)
    return res.json(dto)
  } catch (error) {
    sendError(res, error)
  }
})

router.post<'/ingest', { id: string }>('/ingest', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  if (!(await Conversation.exists({ _id: req.params.id }))) return res.status(404).json({ error: 'not_found' })
  const body = (req.body ?? {}) as GitHubIngestRequest
  try {
    const dto: GitHubIngestDTO = await ingestGitHubRepository(req.params.id, {
      url: body.url,
      ref: body.ref,
      selectedPaths: Array.isArray(body.selectedPaths) ? body.selectedPaths : [],
    })
    return res.status(201).json(dto)
  } catch (error) {
    sendError(res, error)
  }
})

export default router
