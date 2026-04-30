import { inspect } from 'node:util'

type LogLevel = 'debug' | 'info' | 'warning' | 'error'
type LogSource = 'renderer' | 'main'
type LogEntryDTO = {
  id: string
  source: LogSource
  level: LogLevel
  message: string
  timestamp: string
  meta?: Record<string, unknown>
}
export type ClientLogsDTO = {
  renderer: LogEntryDTO[]
  main: LogEntryDTO[]
}

type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error'
type ConsoleMessageDetails = {
  message?: unknown
  level?: unknown
  lineNumber?: unknown
  sourceId?: unknown
}

const MAX_ENTRIES = 800
const mainEntries: LogEntryDTO[] = []
const rendererEntries: LogEntryDTO[] = []
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

function nextId(source: LogSource): string {
  sequence += 1
  return `${source}-${Date.now()}-${sequence}`
}

function pushEntry(entry: LogEntryDTO): void {
  const bucket = entry.source === 'main' ? mainEntries : rendererEntries
  bucket.push(entry)
  if (bucket.length > MAX_ENTRIES) bucket.splice(0, bucket.length - MAX_ENTRIES)
}

export function captureMainLog(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  pushEntry({
    id: nextId('main'),
    source: 'main',
    level,
    message: redact(message),
    timestamp: new Date().toISOString(),
    meta
  })
}

export function captureRendererLog(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  pushEntry({
    id: nextId('renderer'),
    source: 'renderer',
    level,
    message: redact(message),
    timestamp: new Date().toISOString(),
    meta
  })
}

function normalizeConsoleLevel(level: unknown): LogLevel {
  if (level === 'debug' || level === 'info' || level === 'warning' || level === 'error') {
    return level
  }
  if (level === 0) return 'debug'
  if (level === 2) return 'warning'
  if (level === 3) return 'error'
  return 'info'
}

export function captureRendererConsoleMessage(
  details: ConsoleMessageDetails,
  legacyLevel?: number,
  legacyMessage?: string,
  legacyLine?: number,
  legacySourceId?: string
): void {
  const message = typeof details.message === 'string' ? details.message : legacyMessage
  if (!message) return

  const lineNumber = typeof details.lineNumber === 'number' ? details.lineNumber : legacyLine
  const sourceId = typeof details.sourceId === 'string' ? details.sourceId : legacySourceId
  captureRendererLog(normalizeConsoleLevel(details.level ?? legacyLevel), message, {
    ...(typeof sourceId === 'string' && sourceId ? { sourceId } : {}),
    ...(typeof lineNumber === 'number' ? { lineNumber } : {})
  })
}

export function installMainLogCapture(): void {
  if (installed) return
  installed = true

  ;(Object.keys(originalConsole) as ConsoleMethod[]).forEach((method) => {
    console[method] = (...args: unknown[]) => {
      captureMainLog(levelByMethod[method], args.map(stringifyArg).join(' '))
      originalConsole[method](...args)
    }
  })

  process.on('uncaughtExceptionMonitor', (error) => {
    captureMainLog('error', error.stack ?? error.message, { event: 'uncaughtException' })
  })

  process.on('unhandledRejection', (reason) => {
    captureMainLog('error', stringifyArg(reason), { event: 'unhandledRejection' })
  })
}

export function getClientLogs(): ClientLogsDTO {
  return {
    renderer: [...rendererEntries],
    main: [...mainEntries]
  }
}
