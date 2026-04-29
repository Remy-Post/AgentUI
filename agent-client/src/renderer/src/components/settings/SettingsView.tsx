import { useViewStore, type SettingsTab } from '../../store/view'
import ApiKeyTab from './ApiKeyTab'
import ModelTab from './ModelTab'
import BudgetTab from './BudgetTab'
import SubagentsTab from './SubagentsTab'
import SkillsTab from './SkillsTab'
import ToolsTab from './ToolsTab'
import ConversationsTab from './ConversationsTab'

const LEFT_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'model', label: 'Model' },
  { id: 'budget', label: 'Budget' },
  { id: 'skills', label: 'Skills' },
  { id: 'subagents', label: 'Subagents' }
]

const RIGHT_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'tools', label: 'Tools' },
  { id: 'api', label: 'API key' },
  { id: 'conversations', label: 'All conversations' }
]

type Props = {
  onSelectConversation: (id: string) => void
}

export default function SettingsView({ onSelectConversation }: Props): React.JSX.Element {
  const settingsTab = useViewStore((s) => s.settingsTab)
  const setSettingsTab = useViewStore((s) => s.setSettingsTab)

  return (
    <section className="settings-section">
      <header className="settings-header">
        <div className="settings-title">Settings</div>
      </header>
      <nav className="settings-tabs">
        <div className="settings-tabs-group">
          {LEFT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-tab ${settingsTab === t.id ? 'active' : ''}`}
              onClick={() => setSettingsTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="settings-tabs-group">
          {RIGHT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-tab ${settingsTab === t.id ? 'active' : ''}`}
              onClick={() => setSettingsTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="settings-body">
        {settingsTab === 'api' && <ApiKeyTab />}
        {settingsTab === 'model' && <ModelTab />}
        {settingsTab === 'budget' && <BudgetTab />}
        {settingsTab === 'subagents' && <SubagentsTab />}
        {settingsTab === 'skills' && <SkillsTab />}
        {settingsTab === 'tools' && <ToolsTab />}
        {settingsTab === 'conversations' && (
          <ConversationsTab onSelectConversation={onSelectConversation} />
        )}
      </div>
    </section>
  )
}
