import SettingsView from '../settings/SettingsView'
import SettingsSidebar from '../settings/SettingsSidebar'
import EntityList from '../settings/EntityList'
import { useViewStore } from '../../store/view'
import { cx } from '../../lib/classes'
import { useBooleanConfig, useConfig } from '../../hooks/useConfig'
import { useKeybindAction } from '../../hooks/useKeybindAction'

type Props = {
  onSelectConversation: (id: string) => void
}

export default function SettingsLayout({
  onSelectConversation
}: Props): React.JSX.Element {
  const settingsTab = useViewStore((s) => s.settingsTab)
  const { value: collapsed, toggle: toggleCollapsed } = useBooleanConfig('sidebar.collapsed', false)
  const { value: drawerOpen, toggle: toggleDrawer } = useBooleanConfig(
    'settings.entityDrawer.open',
    true
  )
  const { value: drawerWidth } = useConfig<number>('settings.entityDrawer.width', 320)
  const hasDrawer = settingsTab === 'skills' || settingsTab === 'subagents'

  useKeybindAction('settings.toggleEntityDrawer', () => {
    if (!hasDrawer) return false
    toggleDrawer()
    return true
  })

  const frameClass = cx(
    'frame',
    'settings',
    !hasDrawer && 'no-rail',
    hasDrawer && !drawerOpen && 'rail-closed',
    collapsed && 'side-collapsed'
  )

  return (
    <div className={frameClass} style={{ ['--rail-w' as string]: `${drawerWidth}px` }}>
      <SettingsSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <SettingsView
        onSelectConversation={onSelectConversation}
        drawerOpen={drawerOpen}
        onToggleDrawer={toggleDrawer}
      />
      {hasDrawer && (
        <aside className="rail settings-entity-rail">
          <EntityList kind={settingsTab === 'skills' ? 'skill' : 'subagent'} />
        </aside>
      )}
    </div>
  )
}
