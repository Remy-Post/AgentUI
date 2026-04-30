import Sidebar from '../Sidebar'
import SettingsNav from './SettingsNav'

type Props = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export default function SettingsSidebar({
  collapsed,
  onToggleCollapsed
}: Props): React.JSX.Element {
  return (
    <Sidebar
      mode="settings"
      bodySlot={<SettingsNav />}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
    />
  )
}
