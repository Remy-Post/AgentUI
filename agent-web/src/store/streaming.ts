import { create } from 'zustand'
import type { SSEMemoryRecallMemory, SSEToolProgressPayload } from '@shared/types'

export type MemoryRecallEvent = {
  mode: string
  memories: SSEMemoryRecallMemory[]
  ts: number
}

export type ToolEvent = {
  tool_name: string
  task_id?: string
  agent_id?: string
  agent_name?: string
  status?: string
  description?: string
  ts: number
}

type StreamState = {
  active: boolean
  conversationId: string | null
  buffer: string
  toolEvents: ToolEvent[]
  memoryRecallEvents: MemoryRecallEvent[]
  error: string | null
}

type StreamActions = {
  begin: (conversationId: string) => void
  appendAssistant: (text: string) => void
  pushToolEvent: (event: SSEToolProgressPayload) => void
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

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizeToolEvent(event: SSEToolProgressPayload): ToolEvent {
  const taskId = optionalString(event.task_id)
  const agentId = optionalString(event.agent_id)
  const agentName = optionalString(event.agent_name)
  const status = optionalString(event.status)
  const description = optionalString(event.description)
  return {
    tool_name: optionalString(event.tool_name) ?? 'tool',
    ...(taskId ? { task_id: taskId } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(agentName ? { agent_name: agentName } : {}),
    ...(status ? { status } : {}),
    ...(description ? { description } : {}),
    ts: Date.now()
  }
}

export const useStreamingStore = create<StreamState & StreamActions>((set) => ({
  ...initial,
  begin: (conversationId) =>
    set({ active: true, conversationId, buffer: '', toolEvents: [], memoryRecallEvents: [], error: null }),
  appendAssistant: (text) => set((s) => ({ buffer: s.buffer + text })),
  pushToolEvent: (event) =>
    set((s) => ({
      toolEvents: [...s.toolEvents, normalizeToolEvent(event)]
    })),
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
