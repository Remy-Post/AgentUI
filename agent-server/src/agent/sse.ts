import type { Response } from 'express'
import type { SSEEventName } from '../shared/types.ts'

const HEARTBEAT_MS = 30_000

export type SSEHandle = {
  write: (name: SSEEventName, data: unknown) => void
  close: () => void
}

export function openSSE(res: Response): SSEHandle {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(`: keep-alive\n\n`)
  }, HEARTBEAT_MS)

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    if (!res.writableEnded) res.end()
  }

  res.on('close', close)

  return {
    write: (name, data) => {
      if (closed || res.writableEnded) return
      res.write(`event: ${name}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    },
    close,
  }
}
