import { useViewStore, type SettingsTab } from '../../store/view'
import ApiKeyTab from './ApiKeyTab'
import ModelTab from './ModelTab'
import SubagentsTab from './SubagentsTab'
import SkillsTab from './SkillsTab'
import ToolsTab from './ToolsTab'

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'api', label: 'API key' },
  { id: 'model', label: 'Model' },
  { id: 'subagents', label: 'Subagents' },
  { id: 'skills', label: 'Skills' },
  { id: 'tools', label: 'Tools' },
]

export default function SettingsView(): React.JSX.Element {
  const settingsTab = useViewStore((s) => s.settingsTab)
  const setSettingsTab = useViewStore((s) => s.setSettingsTab)

  return (
    <section className="settings-section">
      <header className="settings-header">
        <div className="settings-title">Settings</div>
      </header>
      <nav className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`settings-tab ${settingsTab === t.id ? 'active' : ''}`}
            onClick={() => setSettingsTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        {settingsTab === 'api' && <ApiKeyTab />}
        {settingsTab === 'model' && <ModelTab />}
        {settingsTab === 'subagents' && <SubagentsTab />}
        {settingsTab === 'skills' && <SkillsTab />}
        {settingsTab === 'tools' && <ToolsTab />}
      </div>
    </section>
  )
}
