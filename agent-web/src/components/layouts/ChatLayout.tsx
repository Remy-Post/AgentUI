import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Sidebar from '../Sidebar'
import ChatView from '../ChatView'
import RunInspector from '../RunInspector'
import { useConfig } from '../../hooks/useConfig'
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
  const { value: collapsed, setValue: setCollapsed } = useConfig<boolean>(
    'sidebar.collapsed',
    false
  )
  const { value: railOpen, setValue: setRailOpen } = useConfig<boolean>('inspector.open', true)
  const { value: railWidth, setValue: setRailWidth } = useConfig<number>('inspector.width', 320)

  const messagesQuery = useQuery({
    queryKey: ['messages', selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [] as MessageDTO[]
      return apiFetch<MessageDTO[]>(`/api/sessions/${selectedConversationId}/messages`)
    },
    enabled: !!selectedConversationId
  })

  const frameClass = ['frame', collapsed ? 'side-collapsed' : '', railOpen ? '' : 'rail-closed']
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={frameRef} className={frameClass} style={{ ['--rail-w' as string]: `${railWidth}px` }}>
      <Sidebar
        mode="chat"
        selectedId={selectedConversationId}
        onSelect={onSelectConversation}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
      />
      <ChatView
        conversationId={selectedConversationId}
        inspectorOpen={railOpen}
        onToggleInspector={() => setRailOpen(!railOpen)}
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
