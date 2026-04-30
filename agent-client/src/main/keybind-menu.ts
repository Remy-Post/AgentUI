import { BrowserWindow, Menu, type MenuItemConstructorOptions, type WebContents } from 'electron'

export type KeybindMenuRecord = {
  actionId: string
  label: string
  keys: string
  enabled: boolean
}

type BrowserWindowLike = {
  webContents: WebContents
}

function hasWebContents(value: unknown): value is BrowserWindowLike {
  return !!value && typeof value === 'object' && 'webContents' in value
}

function normalizeKeyToken(token: string): string {
  const lower = token.toLowerCase()
  if (lower === 'esc' || lower === 'escape') return 'Esc'
  if (lower === 'space' || lower === 'spacebar') return 'Space'
  if (lower === 'arrowup') return 'Up'
  if (lower === 'arrowdown') return 'Down'
  if (lower === 'arrowleft') return 'Left'
  if (lower === 'arrowright') return 'Right'
  if (lower === 'plus') return 'Plus'
  if (lower === 'minus') return '-'
  if (lower === 'period') return '.'
  if (lower === 'comma') return ','
  if (lower === 'slash') return '/'
  if (lower === 'backslash') return '\\'
  if (lower === 'delete') return 'Delete'
  if (lower === 'backspace') return 'Backspace'
  if (lower === 'enter' || lower === 'return') return 'Enter'
  if (/^f\d{1,2}$/i.test(token)) return token.toUpperCase()
  return token.length === 1 ? token.toUpperCase() : token
}

function acceleratorFromChord(chord: string): string | null {
  const tokens = chord
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  if (tokens.length === 0) return null

  const modifiers: string[] = []
  let key = ''

  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (lower === 'ctrl' || lower === 'control' || lower === 'mod') {
      modifiers.push('Ctrl')
      continue
    }
    if (lower === 'alt' || lower === 'option') {
      modifiers.push('Alt')
      continue
    }
    if (lower === 'shift') {
      modifiers.push('Shift')
      continue
    }
    if (lower === 'meta' || lower === 'cmd' || lower === 'command' || lower === 'win') {
      modifiers.push('Super')
      continue
    }
    key = normalizeKeyToken(token)
  }

  if (!key || modifiers.length === 0) return null
  return [...new Set(modifiers), key].join('+')
}

export function installKeybindMenu(records: KeybindMenuRecord[]): void {
  const seenAccelerators = new Set<string>()
  const keybindItems = records.flatMap<MenuItemConstructorOptions>((record) => {
    if (!record.enabled) return []
    const accelerator = acceleratorFromChord(record.keys)
    if (!accelerator || seenAccelerators.has(accelerator)) return []
    seenAccelerators.add(accelerator)
    return [
      {
        label: record.label,
        accelerator,
        click: (_item, focusedWindow) => {
          const target = hasWebContents(focusedWindow)
            ? focusedWindow
            : BrowserWindow.getFocusedWindow()
          target?.webContents.send('keybind:run', record.actionId)
        }
      }
    ]
  })

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Agent Desk',
      submenu: keybindItems.length > 0 ? keybindItems : [{ label: 'No keybinds', enabled: false }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
