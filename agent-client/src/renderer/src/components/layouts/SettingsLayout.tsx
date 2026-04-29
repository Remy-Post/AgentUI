import SettingsView from '../settings/SettingsView'
import SettingsSidebar from '../settings/SettingsSidebar'
import { useViewStore } from '../../store/view'

type Props = {
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
}

export default function SettingsLayout({
  selectedConversationId,
  onSelectConversation,
}: Props): React.JSX.Element {
  // settingsTab triggers re-render of sidebar when tab switches.
  useViewStore((s) => s.settingsTab)
  return (
    <div className="frame settings" style={{ gridTemplateColumns: '288px 1fr' }}>
      <SettingsSidebar
        selectedConversationId={selectedConversationId}
        onSelectConversation={onSelectConversation}
      />
      <SettingsView />
    </div>
  )
}
