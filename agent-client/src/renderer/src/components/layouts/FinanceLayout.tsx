import { useState } from 'react'
import FinanceSidebar from '../finance/FinanceSidebar'
import FinanceView from '../finance/FinanceView'
import type { FinanceWindow } from '../../hooks/useFinance'

export default function FinanceLayout(): React.JSX.Element {
  const [windowValue, setWindow] = useState<FinanceWindow>('30d')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  return (
    <div className="frame settings" style={{ gridTemplateColumns: '288px 1fr' }}>
      <FinanceSidebar
        selectedConversationId={selectedConversationId}
        onSelect={setSelectedConversationId}
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
