import { Router } from 'express'
import { getServerLogs } from '../logs.ts'

const router = Router()

router.get('/', (_req, res) => {
  res.json(getServerLogs())
})

export default router
