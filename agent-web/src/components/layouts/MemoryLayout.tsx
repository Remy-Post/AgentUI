import Sidebar from '../Sidebar'
import MemoryView from '../memory/MemoryView'
import { cx } from '../../lib/classes'
import { useBooleanConfig } from '../../hooks/useConfig'

function MemorySidebarBody(): React.JSX.Element {
  return (
    <>
      <div className="recent-cap" style={{ paddingTop: 16 }}>
        <span className="cap">Notes</span>
      </div>
      <ul className="conv-list">
        <li className="conv-item active">
          <div className="dot" />
          <div style={{ minWidth: 0 }}>
            <div className="conv-row">
              <div className="conv-title">All notes</div>
            </div>
            <div className="conv-meta">
              <span className="chrome">local · editable</span>
            </div>
          </div>
        </li>
      </ul>
    </>
  )
}

export default function MemoryLayout(): React.JSX.Element {
  const { value: collapsed, toggle: toggleCollapsed } = useBooleanConfig('sidebar.collapsed', false)
  const frameClass = cx('frame', 'settings', 'no-rail', collapsed && 'side-collapsed')

  return (
    <div className={frameClass}>
      <Sidebar
        mode="memory"
        bodySlot={<MemorySidebarBody />}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <MemoryView />
    </div>
  )
}
