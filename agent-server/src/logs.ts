import { inspect } from 'node:util'
import type { LogEntryDTO, LogLevel, ServerLogsDTO } from './shared/types.ts'

type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error'

const MAX_ENTRIES = 800
const entries: LogEntryDTO[] = []
const originalConsole: Record<ConsoleMethod, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}
const levelByMethod: Record<ConsoleMethod, LogLevel> = {
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warning',
  error: 'error'
}

let installed = false
let sequence = 0

function envSecretValues(): string[] {
  const secretKeyPattern = /(api|auth|credential|key|password|secret|token)/i
  const values = new Set<string>()

  for (const [key, value] of Object.entries(process.env)) {
    if (!value || value.length < 8 || !secretKeyPattern.test(key)) continue
    values.add(value)
  }

  return [...values].sort((a, b) => b.length - a.length)
}

function redact(value: string): string {
  let text = value
  for (const secret of envSecretValues()) {
    text = text.split(secret).join('[redacted]')
  }

  return text
    .replace(/(mongodb(?:\+srv)?:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, '$1[redacted]$3')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]')
}

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`
  return inspect(arg, { depth: 5, breakLength: 160, compact: true })
}

function nextId(): string {
  sequence += 1
  return `server-${Date.now()}-${sequence}`
}

export function captureServerLog(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  entries.push({
    id: nextId(),
    source: 'server',
    level,
    message: redact(message),
    timestamp: new Date().toISOString(),
    meta
  })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
}

export function installServerLogCapture(): void {
  if (installed) return
  installed = true

  ;(Object.keys(originalConsole) as ConsoleMethod[]).forEach((method) => {
    console[method] = (...args: unknown[]) => {
      captureServerLog(levelByMethod[method], args.map(stringifyArg).join(' '))
      originalConsole[method](...args)
    }
  })

  process.on('uncaughtExceptionMonitor', (error) => {
    captureServerLog('error', error.stack ?? error.message, { event: 'uncaughtException' })
  })

  process.on('unhandledRejection', (reason) => {
    captureServerLog('error', stringifyArg(reason), { event: 'unhandledRejection' })
  })
}

export function getServerLogs(): ServerLogsDTO {
  return { entries: [...entries] }
}
