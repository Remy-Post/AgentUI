import { PanelRight } from 'lucide-react'
import { useViewStore } from '../../store/view'
import AppWideTab from './AppWideTab'
import ApiKeyTab from './ApiKeyTab'
import ModelTab from './ModelTab'
import BudgetTab from './BudgetTab'
import SdkMemoryTab from './SdkMemoryTab'
import SubagentsTab from './SubagentsTab'
import SkillsTab from './SkillsTab'
import ToolsTab from './ToolsTab'
import ConversationsTab from './ConversationsTab'
import KeybindsTab from './KeybindsTab'

type Props = {
  onSelectConversation: (id: string) => void
  drawerOpen: boolean
  onToggleDrawer: () => void
}

export default function SettingsView({
  onSelectConversation,
  drawerOpen,
  onToggleDrawer
}: Props): React.JSX.Element {
  const settingsTab = useViewStore((s) => s.settingsTab)
  const hasDrawer = settingsTab === 'skills' || settingsTab === 'subagents'
  const drawerTitle = drawerOpen ? 'Hide entity drawer' : 'Show entity drawer'

  return (
    <section className="settings-section">
      <header className="settings-header">
        <div className="settings-title">Settings</div>
        {hasDrawer && (
          <button
            type="button"
            className="inspector-toggle"
            aria-pressed={drawerOpen}
            aria-label={drawerTitle}
            title={drawerTitle}
            onClick={onToggleDrawer}
          >
            <PanelRight />
          </button>
        )}
      </header>
      <div className="settings-body">
        {settingsTab === 'app-wide' && <AppWideTab />}
        {settingsTab === 'api' && <ApiKeyTab />}
        {settingsTab === 'model' && <ModelTab />}
        {settingsTab === 'budget' && <BudgetTab />}
        {settingsTab === 'memory' && <SdkMemoryTab />}
        {settingsTab === 'subagents' && <SubagentsTab />}
        {settingsTab === 'skills' && <SkillsTab />}
        {settingsTab === 'tools' && <ToolsTab />}
        {settingsTab === 'keybinds' && <KeybindsTab />}
        {settingsTab === 'conversations' && (
          <ConversationsTab onSelectConversation={onSelectConversation} />
        )}
      </div>
    </section>
  )
}
