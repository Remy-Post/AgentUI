import { Router } from 'express'
import { hasGitHubToken, setGitHubToken } from '../github/auth.ts'
import type { GitHubAuthDTO } from '../shared/types.ts'

const router = Router()

router.get('/auth', (_req, res) => {
  const dto: GitHubAuthDTO = { hasToken: hasGitHubToken() }
  return res.json(dto)
})

router.put('/auth/token', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (!token) return res.status(400).json({ error: 'empty_token' })
  setGitHubToken(token)
  const dto: GitHubAuthDTO = { hasToken: true }
  return res.json(dto)
})

export default router

