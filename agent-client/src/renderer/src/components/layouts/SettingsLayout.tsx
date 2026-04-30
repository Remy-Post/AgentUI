import SettingsView from '../settings/SettingsView'
import SettingsSidebar from '../settings/SettingsSidebar'
import EntityList from '../settings/EntityList'
import { useViewStore } from '../../store/view'
import { useConfig } from '../../hooks/useConfig'

type Props = {
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
}

export default function SettingsLayout({
  onSelectConversation
}: Props): React.JSX.Element {
  const settingsTab = useViewStore((s) => s.settingsTab)
  const { value: collapsed, setValue: setCollapsed } = useConfig<boolean>(
    'sidebar.collapsed',
    false
  )
  const { value: drawerOpen, setValue: setDrawerOpen } = useConfig<boolean>(
    'settings.entityDrawer.open',
    true
  )
  const { value: drawerWidth } = useConfig<number>('settings.entityDrawer.width', 320)
  const hasDrawer = settingsTab === 'skills' || settingsTab === 'subagents'

  const frameClass = [
    'frame',
    'settings',
    hasDrawer ? '' : 'no-rail',
    hasDrawer && !drawerOpen ? 'rail-closed' : '',
    collapsed ? 'side-collapsed' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={frameClass} style={{ ['--rail-w' as string]: `${drawerWidth}px` }}>
      <SettingsSidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
      />
      <SettingsView
        onSelectConversation={onSelectConversation}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
      />
      {hasDrawer && (
        <aside className="rail settings-entity-rail">
          <EntityList kind={settingsTab === 'skills' ? 'skill' : 'subagent'} />
        </aside>
      )}
    </div>
  )
}
