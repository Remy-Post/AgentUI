import { useState } from 'react'
import FinanceSidebar from '../finance/FinanceSidebar'
import FinanceView from '../finance/FinanceView'
import type { FinanceWindow } from '../../hooks/useFinance'
import { useConfig } from '../../hooks/useConfig'

export default function FinanceLayout(): React.JSX.Element {
  const [windowValue, setWindow] = useState<FinanceWindow>('30d')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const { value: collapsed, setValue: setCollapsed } = useConfig<boolean>(
    'sidebar.collapsed',
    false
  )

  const frameClass = ['frame', 'settings', 'no-rail', collapsed ? 'side-collapsed' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={frameClass}>
      <FinanceSidebar
        selectedConversationId={selectedConversationId}
        onSelect={setSelectedConversationId}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
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
