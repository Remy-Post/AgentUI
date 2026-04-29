import { MessageSquare, DollarSign, Settings as SettingsIcon } from 'lucide-react'
import { useViewStore, type View } from '../store/view'

const TABS: Array<{ id: View; label: string; icon: typeof MessageSquare; key: string }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, key: '1' },
  { id: 'finance', label: 'Finance', icon: DollarSign, key: '2' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, key: '3' },
]

export default function JumpNav(): React.JSX.Element {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)

  return (
    <nav className="jump-nav" aria-label="Jump between views">
      {TABS.map(({ id, label, icon: Icon, key }) => (
        <button
          key={id}
          type="button"
          className={`jump-tab ${view === id ? 'active' : ''}`}
          onClick={() => setView(id)}
          aria-current={view === id}
        >
          <Icon />
          <span className="jump-label">{label}</span>
          <span className="kbd">{key}</span>
        </button>
      ))}
    </nav>
  )
}
