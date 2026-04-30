export const MODELS = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
} as const

export const MODEL_CLASSES = ['opus', 'sonnet', 'haiku'] as const
export type ModelClass = (typeof MODEL_CLASSES)[number]

// Older builds stored the class label as e.g. "claude-sonnet-4". Map any such
// values back onto the new short class identifier so previously-saved settings
// keep working after the migration.
const LEGACY_MODEL_CLASS_MAP: Record<string, ModelClass> = {
  'claude-opus-4': 'opus',
  'claude-sonnet-4': 'sonnet',
  'claude-haiku-4-5': 'haiku',
}

export const DEFAULT_MODEL_CLASS: ModelClass = 'sonnet'

export function normalizeModelClass(value: unknown): ModelClass {
  if (typeof value !== 'string') return DEFAULT_MODEL_CLASS
  if ((MODEL_CLASSES as readonly string[]).includes(value)) return value as ModelClass
  return LEGACY_MODEL_CLASS_MAP[value] ?? DEFAULT_MODEL_CLASS
}

export function resolveLatestModelId(cls: ModelClass): string {
  return MODELS[cls]
}

// Default context window per Claude API model ID. These are the Anthropic
// API defaults without any beta headers — notably context-1m-2025-08-07
// (not enabled in this app) would lift Sonnet 4.6 and Opus 4.7 to 1M.
// Keys are matched exactly first; otherwise the longest matching prefix
// wins, which lets date-suffixed IDs like "claude-haiku-4-5-20251001"
// resolve via the family entry "claude-haiku-4-5".
export const DEFAULT_CONTEXT_WINDOW = 200_000

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-7': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  // Legacy class identifiers (pre-MERN refactor) still appear in saved settings.
  'claude-opus-4': 200_000,
  'claude-sonnet-4': 200_000,
}

export const ONE_MILLION_CONTEXT_WINDOW = 1_000_000
export const ONE_MILLION_CONTEXT_BETA = 'context-1m-2025-08-07' as const

// Model-family prefixes that accept the context-1m-2025-08-07 beta header.
// Per the @anthropic-ai/claude-agent-sdk type comment, this is currently
// limited to the Sonnet 4 family (4 / 4.5 / 4.6).
const ONE_MILLION_CONTEXT_PREFIXES = ['claude-sonnet-4'] as const

// Model-family prefixes that accept Claude Code's fast-mode flag. Fast mode
// is an Opus-only feature; we gate by the Opus prefix so future Opus 4.x
// releases inherit it automatically.
const FAST_MODE_PREFIXES = ['claude-opus-4'] as const

function modelMatchesAnyPrefix(
  modelId: string | undefined | null,
  prefixes: readonly string[],
): boolean {
  if (typeof modelId !== 'string' || modelId.length === 0) return false
  return prefixes.some((prefix) => modelId.startsWith(prefix))
}

export function modelSupportsOneMillionContext(modelId: string | undefined | null): boolean {
  return modelMatchesAnyPrefix(modelId, ONE_MILLION_CONTEXT_PREFIXES)
}

export function modelSupportsFastMode(modelId: string | undefined | null): boolean {
  return modelMatchesAnyPrefix(modelId, FAST_MODE_PREFIXES)
}

export type ResolveContextWindowOptions = {
  useOneMillionContext?: boolean
}

export function resolveContextWindow(
  modelId: string | undefined | null,
  options?: ResolveContextWindowOptions,
): number {
  if (options?.useOneMillionContext && modelSupportsOneMillionContext(modelId)) {
    return ONE_MILLION_CONTEXT_WINDOW
  }
  if (typeof modelId !== 'string' || modelId.length === 0) return DEFAULT_CONTEXT_WINDOW
  const exact = MODEL_CONTEXT_WINDOWS[modelId]
  if (typeof exact === 'number') return exact
  let best: { prefix: string; window: number } | null = null
  for (const [prefix, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (!modelId.startsWith(prefix)) continue
    if (!best || prefix.length > best.prefix.length) best = { prefix, window }
  }
  return best ? best.window : DEFAULT_CONTEXT_WINDOW
}

export const TOOLS = {
  allowed: ['Read', 'Bash'],
  disallowed: ['Write', 'Edit'],
} as const