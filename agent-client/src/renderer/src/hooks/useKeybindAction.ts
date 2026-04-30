import { useEffect } from 'react'
import {
  KEYBIND_ACTION_EVENT,
  type KeybindActionEvent,
  type KeybindActionId
} from '../lib/keybinds'

type Handler = (actionId: KeybindActionId) => boolean | void

export function useKeybindAction(
  actionIds: KeybindActionId | KeybindActionId[],
  handler: Handler
): void {
  useEffect(() => {
    const ids = new Set(Array.isArray(actionIds) ? actionIds : [actionIds])
    const onAction = (event: Event): void => {
      if (event.defaultPrevented) return
      const actionEvent = event as KeybindActionEvent
      if (!ids.has(actionEvent.detail)) return
      const handled = handler(actionEvent.detail)
      if (handled !== false) actionEvent.preventDefault()
    }

    window.addEventListener(KEYBIND_ACTION_EVENT, onAction)
    return () => window.removeEventListener(KEYBIND_ACTION_EVENT, onAction)
  }, [actionIds, handler])
}
