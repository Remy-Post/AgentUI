import type { SettingsTab, View } from '../store/view'

export type KeybindSource = 'preset' | 'custom'

export type KeybindActionId =
  | 'command.openPalette'
  | 'app.toggleSidebar'
  | 'app.toggleTextLabels'
  | 'app.toggleDescriptions'
  | 'chat.newConversation'
  | 'chat.focusComposer'
  | 'chat.toggleInspector'
  | 'chat.stopStreaming'
  | 'chat.exportConversation'
  | 'chat.cycleEffort'
  | 'chat.openModes'
  | 'chat.togglePlanMode'
  | 'chat.toggleResearchMode'
  | 'chat.toggleDebugMode'
  | 'chat.compressConversation'
  | 'chat.addGithubContext'
  | 'view.chat'
  | 'view.logs'
  | 'view.memory'
  | 'view.finance'
  | 'view.settings'
  | 'settings.appWide'
  | 'settings.api'
  | 'settings.model'
  | 'settings.budget'
  | 'settings.memory'
  | 'settings.skills'
  | 'settings.subagents'
  | 'settings.tools'
  | 'settings.conversations'
  | 'settings.keybinds'
  | 'settings.toggleEntityDrawer'
  | 'settings.newSkill'
  | 'settings.newSubagent'
  | 'settings.newKeybind'
  | 'settings.newSdkMemoryFile'
  | 'settings.saveSdkMemoryFile'
  | 'settings.deleteSdkMemoryFile'
  | 'settings.allowAllTools'
  | 'settings.denyAllTools'
  | 'settings.toggleAutoMemory'
  | 'settings.toggleAutoDream'
  | 'memory.newNote'
  | 'memory.focusSearch'
  | 'memory.clearFilters'
  | 'finance.cycleWindow'
  | 'finance.exportCsv'
  | 'finance.clearConversationSelection'
  | 'finance.openModels'
  | 'logs.toggleClientSource'

export type KeybindAction = {
  id: KeybindActionId
  label: string
  group: string
  description: string
  order: number
}

export type KeybindRecord = {
  id: string
  actionId: KeybindActionId
  label: string
  keys: string
  enabled: boolean
  source: KeybindSource
}

export type KeybindActionEvent = CustomEvent<KeybindActionId>

type ChordParts = {
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  mod: boolean
  key: string
}

export const KEYBIND_ACTION_EVENT = 'agentui:keybind-action'
export const KEYBIND_CONFIG_KEY = 'keybinds.v1'

export const KEYBIND_ACTIONS: KeybindAction[] = [
  {
    id: 'command.openPalette',
    label: 'Open command palette',
    group: 'Core',
    description: 'Open search for conversations and cached messages.',
    order: 10
  },
  {
    id: 'app.toggleSidebar',
    label: 'Toggle sidebar',
    group: 'Core',
    description: 'Collapse or expand the left navigation rail.',
    order: 20
  },
  {
    id: 'app.toggleTextLabels',
    label: 'Toggle text labels',
    group: 'Core',
    description: 'Switch repeated controls between full text and icon-first display.',
    order: 30
  },
  {
    id: 'app.toggleDescriptions',
    label: 'Toggle descriptions',
    group: 'Core',
    description: 'Show or hide helper descriptions throughout the app.',
    order: 40
  },
  {
    id: 'chat.newConversation',
    label: 'New conversation',
    group: 'Chat',
    description: 'Create a new conversation and switch to it.',
    order: 100
  },
  {
    id: 'chat.focusComposer',
    label: 'Focus composer',
    group: 'Chat',
    description: 'Move focus to the chat composer.',
    order: 110
  },
  {
    id: 'chat.toggleInspector',
    label: 'Toggle run inspector',
    group: 'Chat',
    description: 'Show or hide the right-side run inspector.',
    order: 120
  },
  {
    id: 'chat.stopStreaming',
    label: 'Stop streaming',
    group: 'Chat',
    description: 'Abort the active assistant response for the current conversation.',
    order: 130
  },
  {
    id: 'chat.exportConversation',
    label: 'Export conversation',
    group: 'Chat',
    description: 'Download the current conversation as JSON.',
    order: 140
  },
  {
    id: 'chat.cycleEffort',
    label: 'Cycle effort',
    group: 'Chat',
    description: 'Cycle the current conversation effort level.',
    order: 150
  },
  {
    id: 'chat.openModes',
    label: 'Open modes',
    group: 'Chat',
    description: 'Open the composer modes panel.',
    order: 160
  },
  {
    id: 'chat.togglePlanMode',
    label: 'Toggle Plan mode',
    group: 'Chat',
    description: 'Toggle Plan for the next turn.',
    order: 170
  },
  {
    id: 'chat.toggleResearchMode',
    label: 'Toggle Research mode',
    group: 'Chat',
    description: 'Toggle Research for the next turn.',
    order: 180
  },
  {
    id: 'chat.toggleDebugMode',
    label: 'Toggle Debug mode',
    group: 'Chat',
    description: 'Toggle Debug for the next turn.',
    order: 190
  },
  {
    id: 'chat.compressConversation',
    label: 'Compress conversation',
    group: 'Chat',
    description: 'Summarize prior turns and reset session context.',
    order: 200
  },
  {
    id: 'chat.addGithubContext',
    label: 'Add GitHub context',
    group: 'Chat',
    description: 'Open the GitHub context picker for the current conversation.',
    order: 210
  },
  {
    id: 'view.chat',
    label: 'Go to Chat',
    group: 'Navigation',
    description: 'Switch the main workspace to Chat.',
    order: 300
  },
  {
    id: 'view.logs',
    label: 'Go to Logs',
    group: 'Navigation',
    description: 'Switch the main workspace to Logs.',
    order: 310
  },
  {
    id: 'view.memory',
    label: 'Go to Notes',
    group: 'Navigation',
    description: 'Switch the main workspace to Notes.',
    order: 320
  },
  {
    id: 'view.finance',
    label: 'Go to Finance',
    group: 'Navigation',
    description: 'Switch the main workspace to Finance.',
    order: 330
  },
  {
    id: 'view.settings',
    label: 'Go to Settings',
    group: 'Navigation',
    description: 'Switch the main workspace to Settings.',
    order: 340
  },
  {
    id: 'settings.appWide',
    label: 'Open App-wide settings',
    group: 'Settings',
    description: 'Open the App-wide tab in Settings.',
    order: 400
  },
  {
    id: 'settings.api',
    label: 'Open Keys settings',
    group: 'Settings',
    description: 'Open the Keys tab in Settings.',
    order: 410
  },
  {
    id: 'settings.model',
    label: 'Open Model settings',
    group: 'Settings',
    description: 'Open the Model tab in Settings.',
    order: 420
  },
  {
    id: 'settings.budget',
    label: 'Open Budget settings',
    group: 'Settings',
    description: 'Open the Budget tab in Settings.',
    order: 430
  },
  {
    id: 'settings.memory',
    label: 'Open SDK Memory settings',
    group: 'Settings',
    description: 'Open the SDK Memory tab in Settings.',
    order: 440
  },
  {
    id: 'settings.skills',
    label: 'Open Skills settings',
    group: 'Settings',
    description: 'Open the Skills tab in Settings.',
    order: 450
  },
  {
    id: 'settings.subagents',
    label: 'Open Subagents settings',
    group: 'Settings',
    description: 'Open the Subagents tab in Settings.',
    order: 460
  },
  {
    id: 'settings.tools',
    label: 'Open Tools settings',
    group: 'Settings',
    description: 'Open the Tools tab in Settings.',
    order: 470
  },
  {
    id: 'settings.conversations',
    label: 'Open conversations settings',
    group: 'Settings',
    description: 'Open the All conversations tab in Settings.',
    order: 480
  },
  {
    id: 'settings.keybinds',
    label: 'Open Keybinds settings',
    group: 'Settings',
    description: 'Open the Keybinds tab in Settings.',
    order: 490
  },
  {
    id: 'settings.toggleEntityDrawer',
    label: 'Toggle settings drawer',
    group: 'Settings',
    description: 'Show or hide the Skills/Subagents side drawer.',
    order: 500
  },
  {
    id: 'settings.newSkill',
    label: 'New skill',
    group: 'Settings',
    description: 'Open the new Skill editor from the Skills tab.',
    order: 510
  },
  {
    id: 'settings.newSubagent',
    label: 'New subagent',
    group: 'Settings',
    description: 'Open the new Subagent editor from the Subagents tab.',
    order: 520
  },
  {
    id: 'settings.newKeybind',
    label: 'New keybind',
    group: 'Settings',
    description: 'Open the new keybind editor from the Keybinds tab.',
    order: 530
  },
  {
    id: 'settings.newSdkMemoryFile',
    label: 'New SDK memory file',
    group: 'Settings',
    description: 'Open the new SDK memory file dialog.',
    order: 540
  },
  {
    id: 'settings.saveSdkMemoryFile',
    label: 'Save SDK memory file',
    group: 'Settings',
    description: 'Save the selected SDK memory file.',
    order: 550
  },
  {
    id: 'settings.deleteSdkMemoryFile',
    label: 'Delete SDK memory file',
    group: 'Settings',
    description: 'Delete the selected SDK memory file.',
    order: 560
  },
  {
    id: 'settings.allowAllTools',
    label: 'Allow all tools',
    group: 'Settings',
    description: 'Enable every unlocked tool in the Tools tab.',
    order: 570
  },
  {
    id: 'settings.denyAllTools',
    label: 'Deny all tools',
    group: 'Settings',
    description: 'Disable every unlocked tool in the Tools tab.',
    order: 580
  },
  {
    id: 'settings.toggleAutoMemory',
    label: 'Toggle auto-memory',
    group: 'Settings',
    description: 'Toggle Claude Code native memory access.',
    order: 590
  },
  {
    id: 'settings.toggleAutoDream',
    label: 'Toggle auto-dream',
    group: 'Settings',
    description: 'Toggle background memory consolidation.',
    order: 600
  },
  {
    id: 'memory.newNote',
    label: 'New note',
    group: 'Notes',
    description: 'Open the new note editor.',
    order: 700
  },
  {
    id: 'memory.focusSearch',
    label: 'Focus note search',
    group: 'Notes',
    description: 'Move focus to the Notes search field.',
    order: 710
  },
  {
    id: 'memory.clearFilters',
    label: 'Clear note filters',
    group: 'Notes',
    description: 'Clear Notes search, type, and tag filters.',
    order: 720
  },
  {
    id: 'finance.cycleWindow',
    label: 'Cycle finance window',
    group: 'Finance',
    description: 'Cycle the Finance time window.',
    order: 800
  },
  {
    id: 'finance.exportCsv',
    label: 'Export finance CSV',
    group: 'Finance',
    description: 'Download the current Finance view as CSV.',
    order: 810
  },
  {
    id: 'finance.clearConversationSelection',
    label: 'Clear finance selection',
    group: 'Finance',
    description: 'Return Finance to the aggregate spend view.',
    order: 820
  },
  {
    id: 'finance.openModels',
    label: 'Open model filter',
    group: 'Finance',
    description: 'Open the Finance model filter popover.',
    order: 830
  },
  {
    id: 'logs.toggleClientSource',
    label: 'Toggle client log source',
    group: 'Logs',
    description: 'Switch between renderer and main-process client logs.',
    order: 900
  }
]

export const KEYBIND_ACTION_BY_ID = new Map(KEYBIND_ACTIONS.map((action) => [action.id, action]))

const DEFAULT_KEYBINDS: KeybindRecord[] = [
  preset('command.openPalette', 'Ctrl+Alt+P'),
  preset('app.toggleSidebar', 'Ctrl+Alt+B'),
  preset('app.toggleTextLabels', 'Ctrl+Alt+T'),
  preset('app.toggleDescriptions', 'Ctrl+Alt+D'),
  preset('chat.newConversation', 'Ctrl+Alt+N'),
  preset('chat.focusComposer', 'Ctrl+Alt+I'),
  preset('chat.toggleInspector', 'Ctrl+Alt+R'),
  preset('chat.stopStreaming', 'Ctrl+Alt+X'),
  preset('chat.exportConversation', 'Ctrl+Alt+E'),
  preset('chat.cycleEffort', 'Ctrl+Alt+Y'),
  preset('chat.openModes', 'Ctrl+Alt+M'),
  preset('chat.togglePlanMode', 'Ctrl+Alt+Shift+P'),
  preset('chat.toggleResearchMode', 'Ctrl+Alt+Shift+R'),
  preset('chat.toggleDebugMode', 'Ctrl+Alt+Shift+D'),
  preset('chat.compressConversation', 'Ctrl+Alt+C'),
  preset('chat.addGithubContext', 'Ctrl+Alt+G'),
  preset('view.chat', '1'),
  preset('view.logs', '2'),
  preset('view.memory', '3'),
  preset('view.finance', '4'),
  preset('view.settings', '5'),
  preset('settings.appWide', 'Ctrl+Alt+Shift+A'),
  preset('settings.model', 'Ctrl+Alt+Shift+M'),
  preset('settings.budget', 'Ctrl+Alt+Shift+B'),
  preset('settings.memory', 'Ctrl+Alt+Shift+Y'),
  preset('settings.skills', 'Ctrl+Alt+Shift+S'),
  preset('settings.subagents', 'Ctrl+Alt+Shift+G'),
  preset('settings.keybinds', 'Ctrl+Alt+Shift+K'),
  preset('settings.tools', 'Ctrl+Alt+Shift+T'),
  preset('settings.api', 'Ctrl+Alt+Shift+I'),
  preset('settings.conversations', 'Ctrl+Alt+Shift+C'),
  preset('settings.toggleEntityDrawer', 'Ctrl+Alt+Shift+E'),
  preset('settings.newSkill', 'Ctrl+Alt+6'),
  preset('settings.newSubagent', 'Ctrl+Alt+7'),
  preset('settings.newKeybind', 'Ctrl+Alt+8'),
  preset('settings.newSdkMemoryFile', 'Ctrl+Alt+9'),
  preset('settings.saveSdkMemoryFile', 'Ctrl+Alt+S'),
  preset('settings.deleteSdkMemoryFile', 'Ctrl+Alt+Shift+U'),
  preset('settings.allowAllTools', 'Ctrl+Alt+A'),
  preset('settings.denyAllTools', 'Ctrl+Alt+Shift+X'),
  preset('settings.toggleAutoMemory', 'Ctrl+Alt+Shift+O'),
  preset('settings.toggleAutoDream', 'Ctrl+Alt+Shift+Z'),
  preset('memory.newNote', 'Ctrl+Alt+Shift+L'),
  preset('memory.focusSearch', 'Ctrl+Alt+F'),
  preset('memory.clearFilters', 'Ctrl+Alt+Shift+F'),
  preset('finance.cycleWindow', 'Ctrl+Alt+W'),
  preset('finance.exportCsv', 'Ctrl+Alt+Shift+V'),
  preset('finance.clearConversationSelection', 'Ctrl+Alt+Backspace'),
  preset('finance.openModels', 'Ctrl+Alt+O'),
  preset('logs.toggleClientSource', 'Ctrl+Alt+Shift+J')
]

const VIEW_ACTIONS: Partial<Record<KeybindActionId, View>> = {
  'view.chat': 'chat',
  'view.logs': 'logs',
  'view.memory': 'memory',
  'view.finance': 'finance',
  'view.settings': 'settings'
}

const SETTINGS_ACTIONS: Partial<Record<KeybindActionId, SettingsTab>> = {
  'settings.appWide': 'app-wide',
  'settings.api': 'api',
  'settings.model': 'model',
  'settings.budget': 'budget',
  'settings.memory': 'memory',
  'settings.skills': 'skills',
  'settings.subagents': 'subagents',
  'settings.tools': 'tools',
  'settings.conversations': 'conversations',
  'settings.keybinds': 'keybinds'
}

const RESERVED_KEYBIND_REASONS = new Map(
  [
    ['Ctrl+A', 'Reserved for Select all.'],
    ['Ctrl+C', 'Reserved for Copy.'],
    ['Ctrl+V', 'Reserved for Paste.'],
    ['Ctrl+X', 'Reserved for Cut.'],
    ['Ctrl+Z', 'Reserved for Undo.'],
    ['Ctrl+Y', 'Reserved for Redo.'],
    ['Ctrl+F', 'Reserved for Find.'],
    ['Ctrl+G', 'Reserved for Find next.'],
    ['Ctrl+H', 'Reserved for browser history.'],
    ['Ctrl+J', 'Reserved for browser downloads.'],
    ['Ctrl+K', 'Reserved for browser address search.'],
    ['Ctrl+L', 'Reserved for browser address focus.'],
    ['Ctrl+N', 'Reserved for new browser window.'],
    ['Ctrl+O', 'Reserved for opening files.'],
    ['Ctrl+P', 'Reserved for Print.'],
    ['Ctrl+R', 'Reserved for Reload.'],
    ['Ctrl+S', 'Reserved for Save page.'],
    ['Ctrl+T', 'Reserved for new browser tab.'],
    ['Ctrl+U', 'Reserved for page source.'],
    ['Ctrl+W', 'Reserved for closing the tab/window.'],
    ['Ctrl+Tab', 'Reserved for tab navigation.'],
    ['Ctrl+Shift+Tab', 'Reserved for tab navigation.'],
    ['Ctrl+Shift+I', 'Reserved for developer tools.'],
    ['Ctrl+Shift+J', 'Reserved for developer tools.'],
    ['Ctrl+Shift+N', 'Reserved for private browsing.'],
    ['Ctrl+Shift+R', 'Reserved for hard reload.'],
    ['Ctrl+Shift+T', 'Reserved for reopening a closed tab.'],
    ['Alt+D', 'Reserved for browser address focus.'],
    ['Alt+F4', 'Reserved for closing the active window.'],
    ['Alt+Left', 'Reserved for browser Back.'],
    ['Alt+Right', 'Reserved for browser Forward.'],
    ['Ctrl+Alt+Delete', 'Reserved for Windows security options.'],
    ['Ctrl+Alt+Shift+Delete', 'Reserved for Windows security options.'],
    ['F1', 'Reserved for Help.'],
    ['F5', 'Reserved for Reload.'],
    ['F11', 'Reserved for fullscreen.'],
    ['F12', 'Reserved for developer tools.']
  ].map(([chord, reason]) => [resolvedChordKey(chord) ?? chord, reason])
)

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

function normalizeActionId(value: unknown): KeybindActionId | null {
  if (value === 'inspector.toggle') return 'chat.toggleInspector'
  return isKeybindActionId(value) ? value : null
}

function normalizeKeybindId(id: string, actionId: KeybindActionId): string {
  if (id === 'preset.inspector.toggle') return 'preset.chat.toggleInspector'
  if (id.startsWith('preset.')) return `preset.${actionId}`
  return id
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

export function reservedKeybindReason(chord: string): string | null {
  const normalized = normalizeChord(chord)
  if (!normalized) return null
  const key = resolvedChordKey(normalized)
  return key ? RESERVED_KEYBIND_REASONS.get(key) ?? null : null
}

export function emitKeybindAction(actionId: KeybindActionId): boolean {
  if (typeof window === 'undefined') return false
  const event = new CustomEvent<KeybindActionId>(KEYBIND_ACTION_EVENT, {
    detail: actionId,
    cancelable: true
  })
  return !window.dispatchEvent(event)
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
  if (reservedKeybindReason(keybind.keys)) return false
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
  if (isEditableTarget(event.target)) return null
  for (const keybind of keybinds) {
    if (!keybind.enabled) continue
    const action = KEYBIND_ACTION_BY_ID.get(keybind.actionId)
    if (!action) continue
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
  return (
    keybinds.find(
      (keybind) =>
        keybind.actionId === actionId && keybind.enabled && !reservedKeybindReason(keybind.keys)
    ) ?? null
  )
}

export function normalizeKeybinds(value: unknown): KeybindRecord[] {
  const defaults = defaultKeybinds()
  const byId = new Map(defaults.map((keybind) => [keybind.id, keybind]))
  const custom: KeybindRecord[] = []

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isObject(item)) continue
      const actionId = normalizeActionId(item.actionId)
      const id =
        typeof item.id === 'string' && actionId ? normalizeKeybindId(item.id, actionId) : ''
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
