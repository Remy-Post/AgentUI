import type { ConversationColor } from '@shared/types'

export const CONVERSATION_COLORS: Record<ConversationColor, { side: string; main: string }> = {
  slate: { side: '#cbd5e1', main: '#f1f5f9' },
  sky: { side: '#7dd3fc', main: '#e0f2fe' },
  emerald: { side: '#6ee7b7', main: '#d1fae5' },
  amber: { side: '#fcd34d', main: '#fef3c7' },
  rose: { side: '#fda4af', main: '#ffe4e6' },
  violet: { side: '#c4b5fd', main: '#ede9fe' },
  stone: { side: '#d6d3d1', main: '#f5f5f4' }
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
