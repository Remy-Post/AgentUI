import { spawn } from 'node:child_process'
import { z } from 'zod'
import {
  GOOGLE_WORKSPACE_SERVICES,
  type GoogleWorkspaceService,
  isGoogleWorkspaceService,
  parseAllowedGoogleWorkspaceServices,
} from './gwsTypes.ts'

const RESOURCE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/
const METHOD_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000
const TEXT_RESULT_LIMIT = 20_000

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
)

export const GwsCallInputShape = {
  resource: z.string().trim().min(1).max(160).regex(RESOURCE_PATTERN),
  method: z.string().trim().min(1).max(80).regex(METHOD_PATTERN),
  params: z.record(z.string(), JsonValueSchema).optional(),
  body: JsonValueSchema.optional(),
  dryRun: z.boolean().optional(),
  pageAll: z.boolean().optional(),
  pageLimit: z.number().int().min(1).max(100).optional(),
}

export const GwsCallInputSchema = z.object(GwsCallInputShape).strict().superRefine((input, ctx) => {
  if (input.pageLimit !== undefined && input.pageAll !== true) {
    ctx.addIssue({
      code: 'custom',
      path: ['pageLimit'],
      message: 'pageLimit requires pageAll to be true',
    })
  }
})

export const GwsSchemaInputShape = {
  service: z.enum(GOOGLE_WORKSPACE_SERVICES),
  resource: z.string().trim().min(1).max(160).regex(RESOURCE_PATTERN),
  method: z.string().trim().min(1).max(80).regex(METHOD_PATTERN),
  resolveRefs: z.boolean().optional(),
}

export const GwsSchemaInputSchema = z.object(GwsSchemaInputShape).strict()

export type GwsCallInput = z.infer<typeof GwsCallInputSchema>
export type GwsSchemaInput = z.infer<typeof GwsSchemaInputSchema>

export type GwsErrorCode =
  | 'missing_gws_binary'
  | 'auth_failure'
  | 'validation_failure'
  | 'unsupported_service'
  | 'google_api_failure'
  | 'command_timeout'
  | 'output_too_large'
  | 'internal_failure'

export class GwsCommandError extends Error {
  readonly code: GwsErrorCode
  readonly exitCode?: number | null
  readonly stderr?: string
  readonly stdout?: string

  constructor(
    code: GwsErrorCode,
    message: string,
    details: { exitCode?: number | null; stderr?: string; stdout?: string } = {},
  ) {
    super(message)
    this.name = 'GwsCommandError'
    this.code = code
    this.exitCode = details.exitCode
    this.stderr = boundText(details.stderr ?? '')
    this.stdout = boundText(details.stdout ?? '')
  }
}

export type GwsRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
}

export type ParsedGwsOutput =
  | { kind: 'json'; data: unknown }
  | { kind: 'ndjson'; data: unknown[] }
  | { kind: 'text'; text: string }
  | { kind: 'empty'; data: null }

export type GwsCommandOptions = {
  binaryPath?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  maxOutputBytes?: number
  allowedServices?: Iterable<GoogleWorkspaceService>
}

function allowedServiceSet(allowedServices?: Iterable<GoogleWorkspaceService>): Set<GoogleWorkspaceService> {
  return new Set(allowedServices ?? parseAllowedGoogleWorkspaceServices(process.env.GWS_ALLOWED_SERVICES))
}

function assertServiceAllowed(
  service: GoogleWorkspaceService,
  allowedServices?: Iterable<GoogleWorkspaceService>,
): void {
  if (!allowedServiceSet(allowedServices).has(service)) {
    throw new GwsCommandError('unsupported_service', `Google Workspace service '${service}' is not enabled.`)
  }
}

function boundText(value: string): string {
  if (value.length <= TEXT_RESULT_LIMIT) return value
  return `${value.slice(0, TEXT_RESULT_LIMIT)}\n[truncated at ${TEXT_RESULT_LIMIT} characters]`
}

function appendBounded(current: Buffer[], chunk: Buffer, maxBytes: number): { bytes: number; exceeded: boolean } {
  const used = current.reduce((total, part) => total + part.byteLength, 0)
  const next = used + chunk.byteLength
  if (next <= maxBytes) {
    current.push(chunk)
    return { bytes: next, exceeded: false }
  }
  const remaining = Math.max(0, maxBytes - used)
  if (remaining > 0) current.push(chunk.subarray(0, remaining))
  return { bytes: maxBytes, exceeded: true }
}

function classifyExitCode(exitCode: number | null): GwsErrorCode {
  switch (exitCode) {
    case 1:
      return 'google_api_failure'
    case 2:
      return 'auth_failure'
    case 3:
      return 'validation_failure'
    default:
      return 'internal_failure'
  }
}

export function buildGwsCallArgs(
  service: GoogleWorkspaceService,
  rawInput: unknown,
  allowedServices?: Iterable<GoogleWorkspaceService>,
): string[] {
  if (!isGoogleWorkspaceService(service)) {
    throw new GwsCommandError('unsupported_service', `Unsupported Google Workspace service '${service}'.`)
  }
  assertServiceAllowed(service, allowedServices)

  const parsed = GwsCallInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new GwsCommandError('validation_failure', parsed.error.message)
  }
  const input = parsed.data
  const args = [service, ...input.resource.split('.'), input.method, '--format', 'json']

  if (input.params !== undefined) args.push('--params', JSON.stringify(input.params))
  if (input.body !== undefined) args.push('--json', JSON.stringify(input.body))
  if (input.dryRun === true) args.push('--dry-run')
  if (input.pageAll === true) args.push('--page-all')
  if (input.pageLimit !== undefined) args.push('--page-limit', String(input.pageLimit))

  return args
}

export function buildGwsSchemaArgs(
  rawInput: unknown,
  allowedServices?: Iterable<GoogleWorkspaceService>,
): string[] {
  const parsed = GwsSchemaInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new GwsCommandError('validation_failure', parsed.error.message)
  }
  const input = parsed.data
  assertServiceAllowed(input.service, allowedServices)

  const methodId = [input.service, input.resource, input.method].join('.')
  const args = ['schema', methodId]
  if (input.resolveRefs === true) args.push('--resolve-refs')
  return args
}

export function parseGwsOutput(stdout: string): ParsedGwsOutput {
  const trimmed = stdout.trim()
  if (!trimmed) return { kind: 'empty', data: null }

  try {
    return { kind: 'json', data: JSON.parse(trimmed) }
  } catch {
    // Fall through to NDJSON parsing.
  }

  const lines = trimmed.split(/\r?\n/g).filter((line) => line.trim().length > 0)
  if (lines.length > 1) {
    const pages: unknown[] = []
    for (const line of lines) {
      try {
        pages.push(JSON.parse(line))
      } catch {
        return { kind: 'text', text: boundText(stdout) }
      }
    }
    return { kind: 'ndjson', data: pages }
  }

  return { kind: 'text', text: boundText(stdout) }
}

export async function runGws(args: string[], options: GwsCommandOptions = {}): Promise<GwsRunResult> {
  const binaryPath = options.binaryPath ?? process.env.GWS_BINARY_PATH ?? 'gws'
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES

  return await new Promise((resolve, reject) => {
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false
    let timedOut = false
    let outputTooLarge = false

    const child = spawn(binaryPath, args, {
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      callback()
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    timer.unref?.()

    child.stdout?.on('data', (chunk: Buffer) => {
      const result = appendBounded(stdout, chunk, maxOutputBytes)
      if (result.exceeded) {
        outputTooLarge = true
        child.kill('SIGTERM')
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const result = appendBounded(stderr, chunk, maxOutputBytes)
      if (result.exceeded) {
        outputTooLarge = true
        child.kill('SIGTERM')
      }
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      finish(() => {
        if (error.code === 'ENOENT') {
          reject(new GwsCommandError('missing_gws_binary', `Could not find gws binary '${binaryPath}'.`))
          return
        }
        reject(new GwsCommandError('internal_failure', error.message))
      })
    })

    child.on('close', (exitCode) => {
      clearTimeout(timer)
      finish(() => {
        const stdoutText = Buffer.concat(stdout).toString('utf8')
        const stderrText = Buffer.concat(stderr).toString('utf8')
        if (timedOut) {
          reject(new GwsCommandError('command_timeout', `gws command timed out after ${timeoutMs} ms.`, {
            exitCode,
            stdout: stdoutText,
            stderr: stderrText,
          }))
          return
        }
        if (outputTooLarge) {
          reject(new GwsCommandError('output_too_large', `gws output exceeded ${maxOutputBytes} bytes.`, {
            exitCode,
            stdout: stdoutText,
            stderr: stderrText,
          }))
          return
        }
        if (exitCode !== 0) {
          const code = classifyExitCode(exitCode)
          const message = stderrText.trim() || stdoutText.trim() || `gws exited with code ${exitCode}`
          reject(new GwsCommandError(code, boundText(message), { exitCode, stdout: stdoutText, stderr: stderrText }))
          return
        }
        resolve({ stdout: stdoutText, stderr: boundText(stderrText), exitCode })
      })
    })
  })
}

export async function executeGwsCall(
  service: GoogleWorkspaceService,
  rawInput: unknown,
  options: GwsCommandOptions = {},
): Promise<{ output: ParsedGwsOutput; stderr?: string }> {
  const args = buildGwsCallArgs(service, rawInput, options.allowedServices)
  const result = await runGws(args, options)
  return { output: parseGwsOutput(result.stdout), stderr: result.stderr || undefined }
}

export async function executeGwsSchema(
  rawInput: unknown,
  options: GwsCommandOptions = {},
): Promise<{ output: ParsedGwsOutput; stderr?: string }> {
  const args = buildGwsSchemaArgs(rawInput, options.allowedServices)
  const result = await runGws(args, options)
  return { output: parseGwsOutput(result.stdout), stderr: result.stderr || undefined }
}
