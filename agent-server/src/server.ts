import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import type { AddressInfo } from 'net'
import { connectDb, dbStatus } from './db/connection.ts'
import { syncFromDb } from './agent/scaffold.ts'
import { sdkReady } from './agent/session.ts'
import type { HealthDTO } from './shared/types.ts'
import conversationsRouter from './routes/conversations.ts'
import messagesRouter from './routes/messages.ts'
import skillsRouter from './routes/skills.ts'
import subagentsRouter from './routes/subagents.ts'
import settingsRouter from './routes/settings.ts'
import toolsRouter from './routes/tools.ts'
import usageRouter from './routes/usage.ts'

const app = express()

app.use(cors({ origin: true }))
app.use(express.json({ limit: '4mb' }))

app.get('/health', (_req, res) => {
  const health: HealthDTO = {
    db: dbStatus(),
    sdk: sdkReady() ? 'ready' : 'error',
  }
  res.json(health)
})

function requireDb(_req: Request, res: Response, next: NextFunction): void {
  if (dbStatus() !== 'up') {
    res.status(503).json({ error: 'db_unavailable' })
    return
  }
  next()
}

app.use('/api', requireDb)

app.use('/api/sessions', conversationsRouter)
app.use('/api/sessions/:id/messages', messagesRouter)
app.use('/api/skills', skillsRouter)
app.use('/api/subagents', subagentsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/tools', toolsRouter)
app.use('/api/usage', usageRouter)

const DEFAULT_DEV_PORT = 3001
const desiredPort = process.parentPort ? 0 : Number(process.env.AGENT_SERVER_PORT ?? DEFAULT_DEV_PORT)

async function start(): Promise<void> {
  try {
    await connectDb()
    await syncFromDb()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[server] startup error:', message)
    // DB/scaffold startup errors are reported through /health; keep the
    // listener discoverable so the renderer can show the precise state.
  }

  const server = app.listen(desiredPort, '127.0.0.1', () => {
    const { port } = server.address() as AddressInfo
    process.parentPort?.postMessage({ type: 'ready', port })
    if (!process.parentPort) console.log(`[server] listening on http://127.0.0.1:${port}`)
  })

  const shutdown = (): void => {
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.parentPort?.on('message', (event: { data?: unknown }) => {
    if (event && typeof event === 'object' && (event.data as { type?: string } | undefined)?.type === 'shutdown') shutdown()
  })
}

void start()
