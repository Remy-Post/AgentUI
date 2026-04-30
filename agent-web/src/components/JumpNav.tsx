import {
  DollarSign,
  MessageSquare,
  ScrollText,
  Settings as SettingsIcon,
  StickyNote
} from 'lucide-react'
import { useKeybinds } from '../hooks/useKeybinds'
import { firstEnabledKeybindForAction, formatKeybind, type KeybindActionId } from '../lib/keybinds'
import { useViewStore, type View } from '../store/view'

const TABS: Array<{
  id: View
  label: string
  icon: typeof MessageSquare
  actionId: KeybindActionId
}> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, actionId: 'view.chat' },
  { id: 'logs', label: 'Logs', icon: ScrollText, actionId: 'view.logs' },
  { id: 'memory', label: 'Notes', icon: StickyNote, actionId: 'view.memory' },
  { id: 'finance', label: 'Finance', icon: DollarSign, actionId: 'view.finance' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, actionId: 'view.settings' }
]

export default function JumpNav(): React.JSX.Element {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const { keybinds } = useKeybinds()

  return (
    <nav className="jump-nav" aria-label="Jump between views">
      {TABS.map(({ id, label, icon: Icon, actionId }) => {
        const shortcut = firstEnabledKeybindForAction(keybinds, actionId)
        const title = shortcut ? `${label} (${formatKeybind(shortcut.keys)})` : label
        return (
          <button
            key={id}
            type="button"
            className={`jump-tab ${view === id ? 'active' : ''}`}
            onClick={() => setView(id)}
            aria-current={view === id}
            aria-label={`${label} view`}
            title={title}
          >
            <Icon />
          </button>
        )
      })}
    </nav>
  )
}
