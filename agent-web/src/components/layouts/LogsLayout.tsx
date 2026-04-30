import Sidebar from '../Sidebar'
import LogsView from '../logs/LogsView'
import { useConfig } from '../../hooks/useConfig'

function LogsSidebarBody(): React.JSX.Element {
  return (
    <>
      <div className="recent-cap" style={{ paddingTop: 16 }}>
        <span className="cap">Diagnostics</span>
      </div>
      <ul className="conv-list">
        <li className="conv-item active">
          <div className="dot" />
          <div style={{ minWidth: 0 }}>
            <div className="conv-row">
              <div className="conv-title">Current session</div>
            </div>
            <div className="conv-meta">
              <span className="chrome">errors · server · client</span>
            </div>
          </div>
        </li>
      </ul>
    </>
  )
}

export default function LogsLayout(): React.JSX.Element {
  const { value: collapsed, setValue: setCollapsed } = useConfig<boolean>(
    'sidebar.collapsed',
    false
  )
  const frameClass = ['frame', 'settings', 'no-rail', collapsed ? 'side-collapsed' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={frameClass}>
      <Sidebar
        mode="logs"
        bodySlot={<LogsSidebarBody />}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
      />
      <LogsView />
    </div>
  )
}
