import {
  Bot,
  BrainCircuit,
  CreditCard,
  FileText,
  Keyboard,
  KeyRound,
  MessageSquare,
  SlidersHorizontal,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import { useViewStore, type SettingsTab } from '../../store/view'

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
  { id: 'app-wide', label: 'App-wide', icon: SlidersHorizontal },
  { id: 'model', label: 'Model', icon: BrainCircuit },
  { id: 'budget', label: 'Budget', icon: CreditCard },
  { id: 'memory', label: 'SDK Memory', icon: FileText },
  { id: 'skills', label: 'Skills', icon: FileText },
  { id: 'subagents', label: 'Subagents', icon: Bot },
  { id: 'keybinds', label: 'Keybinds', icon: Keyboard },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'api', label: 'Keys', icon: KeyRound },
  { id: 'conversations', label: 'All conversations', icon: MessageSquare }
]

export default function SettingsNav(): React.JSX.Element {
  const settingsTab = useViewStore((s) => s.settingsTab)
  const setSettingsTab = useViewStore((s) => s.setSettingsTab)

  return (
    <>
      <div className="recent-cap">
        <span className="cap">Settings</span>
      </div>
      <ul className="conv-list settings-nav-list">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <li key={tab.id}>
              <button
                type="button"
                className={`conv-item settings-nav-item ${settingsTab === tab.id ? 'active' : ''}`}
                onClick={() => setSettingsTab(tab.id)}
                aria-current={settingsTab === tab.id ? 'page' : undefined}
                aria-label={tab.label}
                title={tab.label}
              >
                <span className="settings-nav-icon">
                  <Icon />
                </span>
                <div className="conv-body">
                  <div className="conv-row">
                    <div className="conv-title">{tab.label}</div>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
