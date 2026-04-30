import { useCallback, useMemo } from 'react'
import { useConfig } from './useConfig'
import {
  KEYBIND_ACTION_BY_ID,
  KEYBIND_CONFIG_KEY,
  findEnabledDuplicate,
  firstEnabledKeybindForAction,
  formatKeybind,
  normalizeChord,
  normalizeKeybinds,
  type KeybindActionId,
  type KeybindRecord
} from '../lib/keybinds'

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `custom.${crypto.randomUUID()}`
  }
  return `custom.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`
}

function serializeKeybinds(keybinds: KeybindRecord[]): KeybindRecord[] {
  return keybinds
    .map((keybind) => {
      const action = KEYBIND_ACTION_BY_ID.get(keybind.actionId)
      return {
        ...keybind,
        label: action?.label ?? keybind.label,
        keys: normalizeChord(keybind.keys)
      }
    })
    .filter((keybind) => keybind.keys)
}

export function useKeybinds(): {
  keybinds: KeybindRecord[]
  isReady: boolean
  createKeybind: (actionId: KeybindActionId, keys: string) => KeybindRecord
  setKeybinds: (next: KeybindRecord[]) => void
  updateKeybind: (id: string, patch: Partial<Omit<KeybindRecord, 'id' | 'source'>>) => void
  removeKeybind: (id: string) => void
  duplicateFor: (candidate: Pick<KeybindRecord, 'id' | 'keys' | 'enabled'>) => KeybindRecord | null
} {
  const { value, setValue, isReady } = useConfig<unknown>(KEYBIND_CONFIG_KEY, [])
  const keybinds = useMemo(() => normalizeKeybinds(value), [value])

  const setKeybinds = useCallback(
    (next: KeybindRecord[]) => {
      setValue(serializeKeybinds(next))
    },
    [setValue]
  )

  const createKeybind = useCallback((actionId: KeybindActionId, keys: string): KeybindRecord => {
    const action = KEYBIND_ACTION_BY_ID.get(actionId)
    return {
      id: createId(),
      actionId,
      label: action?.label ?? actionId,
      keys: normalizeChord(keys),
      enabled: true,
      source: 'custom'
    }
  }, [])

  const updateKeybind = useCallback(
    (id: string, patch: Partial<Omit<KeybindRecord, 'id' | 'source'>>) => {
      setKeybinds(
        keybinds.map((keybind) => {
          if (keybind.id !== id) return keybind
          const actionId = patch.actionId ?? keybind.actionId
          const action = KEYBIND_ACTION_BY_ID.get(actionId)
          return {
            ...keybind,
            ...patch,
            actionId,
            label: action?.label ?? patch.label ?? keybind.label,
            keys: patch.keys ? normalizeChord(patch.keys) : keybind.keys
          }
        })
      )
    },
    [keybinds, setKeybinds]
  )

  const removeKeybind = useCallback(
    (id: string) => {
      setKeybinds(keybinds.filter((keybind) => keybind.id !== id || keybind.source !== 'custom'))
    },
    [keybinds, setKeybinds]
  )

  const duplicateFor = useCallback(
    (candidate: Pick<KeybindRecord, 'id' | 'keys' | 'enabled'>) =>
      findEnabledDuplicate(keybinds, candidate),
    [keybinds]
  )

  return {
    keybinds,
    isReady,
    createKeybind,
    setKeybinds,
    updateKeybind,
    removeKeybind,
    duplicateFor
  }
}

export function useKeybindShortcut(actionId: KeybindActionId): string | null {
  const { keybinds } = useKeybinds()
  const keybind = firstEnabledKeybindForAction(keybinds, actionId)
  return keybind ? formatKeybind(keybind.keys) : null
}
