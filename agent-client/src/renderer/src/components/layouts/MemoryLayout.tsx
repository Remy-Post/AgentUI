import Sidebar from '../Sidebar'
import MemoryView from '../memory/MemoryView'
import { useConfig } from '../../hooks/useConfig'

function MemorySidebarBody(): React.JSX.Element {
  return (
    <>
      <div className="recent-cap" style={{ paddingTop: 16 }}>
        <span className="cap">Memory</span>
      </div>
      <ul className="conv-list">
        <li className="conv-item active">
          <div className="dot" />
          <div style={{ minWidth: 0 }}>
            <div className="conv-row">
              <div className="conv-title">Coming soon</div>
            </div>
            <div className="conv-meta">
              <span className="chrome">page 5</span>
            </div>
          </div>
        </li>
      </ul>
    </>
  )
}

export default function MemoryLayout(): React.JSX.Element {
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
        mode="memory"
        bodySlot={<MemorySidebarBody />}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
      />
      <MemoryView />
    </div>
  )
}
