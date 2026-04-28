import { create } from 'zustand'

type StreamState = {
  active: boolean
  conversationId: string | null
  buffer: string
  toolEvents: Array<{ tool_name: string; ts: number }>
  error: string | null
}

type StreamActions = {
  begin: (conversationId: string) => void
  appendAssistant: (text: string) => void
  pushToolEvent: (event: { tool_name: string }) => void
  end: () => void
  fail: (message: string) => void
  reset: () => void
}

const initial: StreamState = {
  active: false,
  conversationId: null,
  buffer: '',
  toolEvents: [],
  error: null,
}

export const useStreamingStore = create<StreamState & StreamActions>((set) => ({
  ...initial,
  begin: (conversationId) =>
    set({ active: true, conversationId, buffer: '', toolEvents: [], error: null }),
  appendAssistant: (text) => set((s) => ({ buffer: s.buffer + text })),
  pushToolEvent: ({ tool_name }) =>
    set((s) => ({ toolEvents: [...s.toolEvents, { tool_name, ts: Date.now() }] })),
  end: () => set({ active: false }),
  fail: (message) => set({ active: false, error: message }),
  reset: () => set(initial),
}))
