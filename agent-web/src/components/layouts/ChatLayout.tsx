import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Sidebar from '../Sidebar'
import ChatView from '../ChatView'
import RunInspector from '../RunInspector'
import { cx } from '../../lib/classes'
import { useBooleanConfig, useConfig } from '../../hooks/useConfig'
import { apiFetch } from '../../lib/api'
import type { MessageDTO } from '@shared/types'

type Props = {
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
}

export default function ChatLayout({
  selectedConversationId,
  onSelectConversation
}: Props): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  const { value: collapsed, toggle: toggleCollapsed } = useBooleanConfig('sidebar.collapsed', false)
  const { value: railOpen, toggle: toggleRailOpen } = useBooleanConfig('inspector.open', true)
  const { value: railWidth, setValue: setRailWidth } = useConfig<number>('inspector.width', 320)

  const messagesQuery = useQuery({
    queryKey: ['messages', selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [] as MessageDTO[]
      return apiFetch<MessageDTO[]>(`/api/sessions/${selectedConversationId}/messages`)
    },
    enabled: !!selectedConversationId
  })

  const frameClass = cx('frame', collapsed && 'side-collapsed', !railOpen && 'rail-closed')

  return (
    <div ref={frameRef} className={frameClass} style={{ ['--rail-w' as string]: `${railWidth}px` }}>
      <Sidebar
        mode="chat"
        selectedId={selectedConversationId}
        onSelect={onSelectConversation}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <ChatView
        conversationId={selectedConversationId}
        inspectorOpen={railOpen}
        onToggleInspector={toggleRailOpen}
      />
      <aside className="rail">
        <RunInspector
          conversationId={selectedConversationId}
          messages={messagesQuery.data ?? []}
          width={railWidth}
          onWidthChange={setRailWidth}
          frameRef={frameRef}
        />
      </aside>
    </div>
  )
}
