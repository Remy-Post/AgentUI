import { useState } from 'react'
import FinanceSidebar from '../finance/FinanceSidebar'
import FinanceView from '../finance/FinanceView'
import type { FinanceWindow } from '../../hooks/useFinance'
import { cx } from '../../lib/classes'
import { useBooleanConfig } from '../../hooks/useConfig'

export default function FinanceLayout(): React.JSX.Element {
  const [windowValue, setWindow] = useState<FinanceWindow>('30d')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const { value: collapsed, toggle: toggleCollapsed } = useBooleanConfig('sidebar.collapsed', false)

  const frameClass = cx('frame', 'settings', 'no-rail', collapsed && 'side-collapsed')

  return (
    <div className={frameClass}>
      <FinanceSidebar
        selectedConversationId={selectedConversationId}
        onSelect={setSelectedConversationId}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <FinanceView
        windowValue={windowValue}
        setWindow={setWindow}
        selectedConversationId={selectedConversationId}
        onClearSelection={() => setSelectedConversationId(null)}
      />
    </div>
  )
}
