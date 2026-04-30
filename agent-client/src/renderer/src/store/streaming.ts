import { create } from 'zustand'
import type { SSEMemoryRecallMemory } from '@shared/types'

export type MemoryRecallEvent = {
  mode: string
  memories: SSEMemoryRecallMemory[]
  ts: number
}

type StreamState = {
  active: boolean
  conversationId: string | null
  buffer: string
  toolEvents: Array<{ tool_name: string; ts: number }>
  memoryRecallEvents: MemoryRecallEvent[]
  error: string | null
}

type StreamActions = {
  begin: (conversationId: string) => void
  appendAssistant: (text: string) => void
  pushToolEvent: (event: { tool_name: string }) => void
  pushMemoryRecall: (event: { mode?: string; memories?: unknown[] }) => void
  clearToolEvents: () => void
  end: () => void
  fail: (message: string) => void
  reset: () => void
}

const initial: StreamState = {
  active: false,
  conversationId: null,
  buffer: '',
  toolEvents: [],
  memoryRecallEvents: [],
  error: null
}

function normalizeRecallMemories(value: unknown): SSEMemoryRecallMemory[] {
  if (!Array.isArray(value)) return []
  const memories: SSEMemoryRecallMemory[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as { path?: unknown; scope?: unknown; content?: unknown }
    if (typeof candidate.path !== 'string' || !candidate.path) continue
    memories.push({
      path: candidate.path,
      scope: typeof candidate.scope === 'string' && candidate.scope ? candidate.scope : 'unknown',
      ...(typeof candidate.content === 'string' ? { content: candidate.content } : {})
    })
  }
  return memories
}

export const useStreamingStore = create<StreamState & StreamActions>((set) => ({
  ...initial,
  begin: (conversationId) =>
    set({ active: true, conversationId, buffer: '', toolEvents: [], memoryRecallEvents: [], error: null }),
  appendAssistant: (text) => set((s) => ({ buffer: s.buffer + text })),
  pushToolEvent: ({ tool_name }) =>
    set((s) => ({ toolEvents: [...s.toolEvents, { tool_name, ts: Date.now() }] })),
  pushMemoryRecall: ({ mode, memories }) =>
    set((s) => ({
      memoryRecallEvents: [
        ...s.memoryRecallEvents,
        { mode: mode ?? 'select', memories: normalizeRecallMemories(memories), ts: Date.now() }
      ]
    })),
  clearToolEvents: () => set({ toolEvents: [], memoryRecallEvents: [] }),
  end: () => set({ active: false }),
  fail: (message) => set({ active: false, error: message }),
  reset: () => set(initial)
}))
