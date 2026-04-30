import type { SettingsTab, View } from '../store/view'

export type KeybindSource = 'preset' | 'custom'

export type KeybindActionId =
  | 'command.openPalette'
  | 'chat.newConversation'
  | 'inspector.toggle'
  | 'view.chat'
  | 'view.logs'
  | 'view.memory'
  | 'view.finance'
  | 'view.settings'
  | 'settings.api'
  | 'settings.model'
  | 'settings.budget'
  | 'settings.skills'
  | 'settings.subagents'
  | 'settings.tools'
  | 'settings.conversations'
  | 'settings.keybinds'

export type KeybindAction = {
  id: KeybindActionId
  label: string
  group: string
  description: string
  order: number
  allowInEditable?: boolean
}

export type KeybindRecord = {
  id: string
  actionId: KeybindActionId
  label: string
  keys: string
  enabled: boolean
  source: KeybindSource
}

type ChordParts = {
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  mod: boolean
  key: string
}

export const KEYBIND_CONFIG_KEY = 'keybinds.v1'

export const KEYBIND_ACTIONS: KeybindAction[] = [
  {
    id: 'command.openPalette',
    label: 'Open command palette',
    group: 'Core',
    description: 'Open search for conversations and cached messages.',
    order: 10,
    allowInEditable: true
  },
  {
    id: 'chat.newConversation',
    label: 'New conversation',
    group: 'Chat',
    description: 'Create a new conversation and switch to it.',
    order: 20,
    allowInEditable: true
  },
  {
    id: 'inspector.toggle',
    label: 'Toggle run inspector',
    group: 'Chat',
    description: 'Show or hide the right-side run inspector.',
    order: 30,
    allowInEditable: true
  },
  {
    id: 'view.chat',
    label: 'Go to Chat',
    group: 'Navigation',
    description: 'Switch the main workspace to Chat.',
    order: 100
  },
  {
    id: 'view.logs',
    label: 'Go to Logs',
    group: 'Navigation',
    description: 'Switch the main workspace to Logs.',
    order: 110
  },
  {
    id: 'view.memory',
    label: 'Go to Notes',
    group: 'Navigation',
    description: 'Switch the main workspace to Notes.',
    order: 120
  },
  {
    id: 'view.finance',
    label: 'Go to Finance',
    group: 'Navigation',
    description: 'Switch the main workspace to Finance.',
    order: 130
  },
  {
    id: 'view.settings',
    label: 'Go to Settings',
    group: 'Navigation',
    description: 'Switch the main workspace to Settings.',
    order: 140
  },
  {
    id: 'settings.api',
    label: 'Open Keys settings',
    group: 'Settings',
    description: 'Open the Keys tab in Settings.',
    order: 200
  },
  {
    id: 'settings.model',
    label: 'Open Model settings',
    group: 'Settings',
    description: 'Open the Model tab in Settings.',
    order: 210
  },
  {
    id: 'settings.budget',
    label: 'Open Budget settings',
    group: 'Settings',
    description: 'Open the Budget tab in Settings.',
    order: 220
  },
  {
    id: 'settings.skills',
    label: 'Open Skills settings',
    group: 'Settings',
    description: 'Open the Skills tab in Settings.',
    order: 230
  },
  {
    id: 'settings.subagents',
    label: 'Open Subagents settings',
    group: 'Settings',
    description: 'Open the Subagents tab in Settings.',
    order: 240
  },
  {
    id: 'settings.tools',
    label: 'Open Tools settings',
    group: 'Settings',
    description: 'Open the Tools tab in Settings.',
    order: 250
  },
  {
    id: 'settings.conversations',
    label: 'Open conversations settings',
    group: 'Settings',
    description: 'Open the All conversations tab in Settings.',
    order: 260
  },
  {
    id: 'settings.keybinds',
    label: 'Open Keybinds settings',
    group: 'Settings',
    description: 'Open the Keybinds tab in Settings.',
    order: 270
  }
]

export const KEYBIND_ACTION_BY_ID = new Map(KEYBIND_ACTIONS.map((action) => [action.id, action]))

const DEFAULT_KEYBINDS: KeybindRecord[] = [
  preset('command.openPalette', 'Mod+K'),
  preset('chat.newConversation', 'Mod+N'),
  preset('inspector.toggle', 'Mod+.'),
  preset('view.chat', '1'),
  preset('view.logs', '2'),
  preset('view.memory', '3'),
  preset('view.finance', '4'),
  preset('view.settings', '5')
]

const VIEW_ACTIONS: Partial<Record<KeybindActionId, View>> = {
  'view.chat': 'chat',
  'view.logs': 'logs',
  'view.memory': 'memory',
  'view.finance': 'finance',
  'view.settings': 'settings'
}

const SETTINGS_ACTIONS: Partial<Record<KeybindActionId, SettingsTab>> = {
  'settings.api': 'api',
  'settings.model': 'model',
  'settings.budget': 'budget',
  'settings.skills': 'skills',
  'settings.subagents': 'subagents',
  'settings.tools': 'tools',
  'settings.conversations': 'conversations',
  'settings.keybinds': 'keybinds'
}

function preset(actionId: KeybindActionId, keys: string): KeybindRecord {
  const action = KEYBIND_ACTION_BY_ID.get(actionId)
  return {
    id: `preset.${actionId}`,
    actionId,
    label: action?.label ?? actionId,
    keys,
    enabled: true,
    source: 'preset'
  }
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform)
}

function actionLabel(actionId: KeybindActionId, fallback: string): string {
  return KEYBIND_ACTION_BY_ID.get(actionId)?.label ?? fallback
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isKeybindActionId(value: unknown): value is KeybindActionId {
  return typeof value === 'string' && KEYBIND_ACTION_BY_ID.has(value as KeybindActionId)
}

function normalizeKeyToken(raw: string): string {
  const token = raw.trim()
  const lower = token.toLowerCase()

  if (!token) return ''
  if (lower === 'escape') return 'Esc'
  if (lower === 'esc') return 'Esc'
  if (lower === ' ') return 'Space'
  if (lower === 'space' || lower === 'spacebar') return 'Space'
  if (lower === 'arrowup') return 'ArrowUp'
  if (lower === 'arrowdown') return 'ArrowDown'
  if (lower === 'arrowleft') return 'ArrowLeft'
  if (lower === 'arrowright') return 'ArrowRight'
  if (lower === 'plus' || token === '+') return 'Plus'
  if (lower === 'minus') return '-'
  if (lower === 'period' || lower === 'dot') return '.'
  if (lower === 'comma') return ','
  if (lower === 'slash') return '/'
  if (lower === 'backslash') return '\\'
  if (lower === 'enter' || lower === 'return') return 'Enter'
  if (lower === 'delete') return 'Delete'
  if (lower === 'backspace') return 'Backspace'
  if (/^f\d{1,2}$/i.test(token)) return token.toUpperCase()
  if (token.length === 1) return /[a-z]/i.test(token) ? token.toUpperCase() : token
  return token
}

function parseChord(chord: string, resolveMod = false): ChordParts | null {
  const tokens = chord
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  if (tokens.length === 0) return null

  const parts: ChordParts = {
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    mod: false,
    key: ''
  }

  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') {
      parts.ctrl = true
      continue
    }
    if (lower === 'meta' || lower === 'cmd' || lower === 'command' || lower === 'win') {
      parts.meta = true
      continue
    }
    if (lower === 'mod') {
      if (resolveMod) {
        if (isMacPlatform()) parts.meta = true
        else parts.ctrl = true
      } else {
        parts.mod = true
      }
      continue
    }
    if (lower === 'alt' || lower === 'option') {
      parts.alt = true
      continue
    }
    if (lower === 'shift') {
      parts.shift = true
      continue
    }
    parts.key = normalizeKeyToken(token)
  }

  return parts.key ? parts : null
}

function chordFromEventParts(event: KeyboardEvent): ChordParts | null {
  const key = normalizeKeyToken(event.key)
  if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null
  return {
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
    mod: false,
    key
  }
}

function stringifyParts(parts: ChordParts): string {
  const tokens: string[] = []
  if (parts.mod) tokens.push('Mod')
  if (parts.ctrl) tokens.push('Ctrl')
  if (parts.meta) tokens.push('Meta')
  if (parts.alt) tokens.push('Alt')
  if (parts.shift) tokens.push('Shift')
  tokens.push(parts.key)
  return tokens.join('+')
}

function resolvedChordKey(chord: string): string | null {
  const parts = parseChord(chord, true)
  if (!parts) return null
  return [
    parts.ctrl ? 'ctrl' : '',
    parts.meta ? 'meta' : '',
    parts.alt ? 'alt' : '',
    parts.shift ? 'shift' : '',
    parts.key.toLowerCase()
  ].join('|')
}

function hasEditableFieldModifier(chord: string): boolean {
  const parts = parseChord(chord, true)
  return !!parts && (parts.ctrl || parts.meta || parts.alt)
}

export function defaultKeybinds(): KeybindRecord[] {
  return DEFAULT_KEYBINDS.map((keybind) => ({ ...keybind }))
}

export function normalizeChord(chord: string): string {
  const parts = parseChord(chord)
  return parts ? stringifyParts(parts) : ''
}

export function chordFromKeyboardEvent(event: KeyboardEvent): string | null {
  const parts = chordFromEventParts(event)
  return parts ? stringifyParts(parts) : null
}

export function formatKeybind(chord: string): string {
  const tokens = chord
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  return tokens
    .map((token) => {
      const lower = token.toLowerCase()
      if (lower === 'mod') return isMacPlatform() ? 'Cmd' : 'Ctrl'
      if (lower === 'meta') return isMacPlatform() ? 'Cmd' : 'Meta'
      if (lower === 'ctrl' || lower === 'control') return 'Ctrl'
      if (lower === 'alt' || lower === 'option') return isMacPlatform() ? 'Option' : 'Alt'
      if (lower === 'shift') return 'Shift'
      if (lower === 'plus') return '+'
      return normalizeKeyToken(token)
    })
    .join('+')
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable === true
  )
}

export function eventMatchesKeybind(event: KeyboardEvent, keybind: KeybindRecord): boolean {
  const eventParts = chordFromEventParts(event)
  const keybindParts = parseChord(keybind.keys, true)
  if (!eventParts || !keybindParts) return false
  return (
    eventParts.ctrl === keybindParts.ctrl &&
    eventParts.meta === keybindParts.meta &&
    eventParts.alt === keybindParts.alt &&
    eventParts.shift === keybindParts.shift &&
    eventParts.key.toLowerCase() === keybindParts.key.toLowerCase()
  )
}

export function findKeybindForEvent(
  event: KeyboardEvent,
  keybinds: KeybindRecord[]
): KeybindRecord | null {
  const inEditable = isEditableTarget(event.target)
  for (const keybind of keybinds) {
    if (!keybind.enabled) continue
    const action = KEYBIND_ACTION_BY_ID.get(keybind.actionId)
    if (!action) continue
    if (inEditable && (!action.allowInEditable || !hasEditableFieldModifier(keybind.keys))) {
      continue
    }
    if (eventMatchesKeybind(event, keybind)) return keybind
  }
  return null
}

export function findEnabledDuplicate(
  keybinds: KeybindRecord[],
  candidate: Pick<KeybindRecord, 'id' | 'keys' | 'enabled'>
): KeybindRecord | null {
  if (!candidate.enabled) return null
  const candidateKey = resolvedChordKey(candidate.keys)
  if (!candidateKey) return null
  return (
    keybinds.find(
      (keybind) =>
        keybind.id !== candidate.id &&
        keybind.enabled &&
        resolvedChordKey(keybind.keys) === candidateKey
    ) ?? null
  )
}

export function firstEnabledKeybindForAction(
  keybinds: KeybindRecord[],
  actionId: KeybindActionId
): KeybindRecord | null {
  return keybinds.find((keybind) => keybind.actionId === actionId && keybind.enabled) ?? null
}

export function normalizeKeybinds(value: unknown): KeybindRecord[] {
  const defaults = defaultKeybinds()
  const byId = new Map(defaults.map((keybind) => [keybind.id, keybind]))
  const custom: KeybindRecord[] = []

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isObject(item)) continue
      const id = typeof item.id === 'string' ? item.id : ''
      const actionId = isKeybindActionId(item.actionId) ? item.actionId : null
      const keys = typeof item.keys === 'string' ? normalizeChord(item.keys) : ''
      const enabled = typeof item.enabled === 'boolean' ? item.enabled : true
      const source: KeybindSource = item.source === 'custom' ? 'custom' : 'preset'

      if (!id || !actionId || !keys) continue

      if (source === 'preset' && byId.has(id)) {
        const existing = byId.get(id)!
        byId.set(id, {
          ...existing,
          keys,
          enabled,
          label: actionLabel(existing.actionId, existing.label)
        })
        continue
      }

      if (source === 'custom') {
        custom.push({
          id,
          actionId,
          keys,
          enabled,
          source,
          label: typeof item.label === 'string' ? item.label : actionLabel(actionId, actionId)
        })
      }
    }
  }

  return [...byId.values(), ...custom].sort((left, right) => {
    const leftAction = KEYBIND_ACTION_BY_ID.get(left.actionId)
    const rightAction = KEYBIND_ACTION_BY_ID.get(right.actionId)
    const leftOrder = leftAction?.order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = rightAction?.order ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    if (left.source !== right.source) return left.source === 'preset' ? -1 : 1
    return left.label.localeCompare(right.label)
  })
}

export function viewForKeybindAction(actionId: KeybindActionId): View | null {
  return VIEW_ACTIONS[actionId] ?? null
}

export function settingsTabForKeybindAction(actionId: KeybindActionId): SettingsTab | null {
  return SETTINGS_ACTIONS[actionId] ?? null
}
