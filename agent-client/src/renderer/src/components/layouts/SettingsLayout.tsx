import SettingsView from '../settings/SettingsView'
import SettingsSidebar from '../settings/SettingsSidebar'
import { useViewStore } from '../../store/view'
import { useConfig } from '../../hooks/useConfig'

type Props = {
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
}

export default function SettingsLayout({
  selectedConversationId,
  onSelectConversation
}: Props): React.JSX.Element {
  // settingsTab triggers re-render of sidebar when tab switches.
  useViewStore((s) => s.settingsTab)
  const { value: collapsed, setValue: setCollapsed } = useConfig<boolean>(
    'sidebar.collapsed',
    false
  )

  const frameClass = ['frame', 'settings', 'no-rail', collapsed ? 'side-collapsed' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={frameClass}>
      <SettingsSidebar
        selectedConversationId={selectedConversationId}
        onSelectConversation={onSelectConversation}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
      />
      <SettingsView onSelectConversation={onSelectConversation} />
    </div>
  )
}
