import type { ConversationColor } from '@shared/types'

const CHAT_SURFACE_BACKGROUND = 'var(--color-paper)'

export const CONVERSATION_COLORS: Record<
  ConversationColor,
  { side: string; main: string; input: string }
> = {
  slate: { side: '#cbd5e1', main: CHAT_SURFACE_BACKGROUND, input: '#f1f5f9' },
  sky: { side: '#7dd3fc', main: CHAT_SURFACE_BACKGROUND, input: '#e0f2fe' },
  emerald: { side: '#6ee7b7', main: CHAT_SURFACE_BACKGROUND, input: '#d1fae5' },
  amber: { side: '#fcd34d', main: CHAT_SURFACE_BACKGROUND, input: '#fef3c7' },
  rose: { side: '#fda4af', main: CHAT_SURFACE_BACKGROUND, input: '#ffe4e6' },
  violet: { side: '#c4b5fd', main: CHAT_SURFACE_BACKGROUND, input: '#ede9fe' },
  stone: { side: '#d6d3d1', main: CHAT_SURFACE_BACKGROUND, input: '#f5f5f4' }
}

export const CONVERSATION_COLOR_KEYS = Object.keys(CONVERSATION_COLORS) as ConversationColor[]

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export const TITLE_MIN_CHARS = 4
export const DESCRIPTION_MIN_WORDS = 10
export const DESCRIPTION_MAX_WORDS = 500

export function isValidTitle(title: string): boolean {
  return title.trim().length >= TITLE_MIN_CHARS
}

export function isValidDescription(description: string): boolean {
  const words = countWords(description)
  if (words === 0) return true
  return words >= DESCRIPTION_MIN_WORDS && words <= DESCRIPTION_MAX_WORDS
}
