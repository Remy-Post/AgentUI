import {
  unstable_v2_createSession,
  type SDKSession,
  type SDKSessionOptions,
} from '@anthropic-ai/claude-agent-sdk'
import { protectSensitiveFiles } from '../../util/hooks.ts'
import { TOOLS, MODELS } from '../../util/vars.ts'
import { syncFromDb } from './scaffold.ts'

type Entry = {
  conversationId: string
  session: SDKSession
  lastUsed: number
  createdAt: number
  busy: boolean
}

const MAX_SESSIONS = 8
const IDLE_MS = 30 * 60_000

const cache = new Map<string, Entry>()
let evictionTimer: NodeJS.Timeout | null = null

function startEvictionTimer(): void {
  if (evictionTimer) return
  evictionTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (entry.busy) continue
      if (now - entry.lastUsed > IDLE_MS) {
        cache.delete(key)
        void disposeSession(entry.session)
      }
    }
  }, 60_000)
  evictionTimer.unref?.()
}

async function disposeSession(session: SDKSession): Promise<void> {
  try {
    await session[Symbol.asyncDispose]()
  } catch {
    // best-effort dispose
  }
}

function buildSessionOptions(model: string): SDKSessionOptions {
  return {
    model,
    settingSources: ['project'],
    hooks: {
      PreToolUse: [
        {
          matcher: TOOLS.disallowed.join('|'),
          hooks: [protectSensitiveFiles],
        },
      ],
    },
  }
}

export async function getOrCreateSession(conversationId: string, model: string = MODELS.opus): Promise<Entry> {
  const existing = cache.get(conversationId)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing
  }

  if (cache.size >= MAX_SESSIONS) evictOldestIdle()

  await syncFromDb()

  const session = unstable_v2_createSession(buildSessionOptions(model))
  const entry: Entry = {
    conversationId,
    session,
    lastUsed: Date.now(),
    createdAt: Date.now(),
    busy: false,
  }
  cache.set(conversationId, entry)
  startEvictionTimer()
  return entry
}

function evictOldestIdle(): void {
  let victimKey: string | null = null
  let victimLastUsed = Infinity
  for (const [key, entry] of cache) {
    if (entry.busy) continue
    if (entry.lastUsed < victimLastUsed) {
      victimKey = key
      victimLastUsed = entry.lastUsed
    }
  }
  if (victimKey) {
    const victim = cache.get(victimKey)
    cache.delete(victimKey)
    if (victim) void disposeSession(victim.session)
  }
}

export function dropSession(conversationId: string): void {
  const entry = cache.get(conversationId)
  if (!entry) return
  cache.delete(conversationId)
  void disposeSession(entry.session)
}

export function isStreaming(conversationId: string): boolean {
  return cache.get(conversationId)?.busy === true
}

export function markBusy(conversationId: string, busy: boolean): void {
  const entry = cache.get(conversationId)
  if (entry) {
    entry.busy = busy
    entry.lastUsed = Date.now()
  }
}

export function sdkReady(): boolean {
  return true
}
