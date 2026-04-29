import { PanelRight } from 'lucide-react'
import EffortPopover from './EffortPopover'
import ContextsChip from './ContextsChip'
import { formatStartedAt } from '../lib/format'
import type { ConversationDTO, MessageDTO } from '@shared/types'

type Props = {
  conversation: ConversationDTO
  messages: MessageDTO[]
  inspectorOpen: boolean
  onToggleInspector: () => void
}

export default function ChatHeader({
  conversation,
  messages,
  inspectorOpen,
  onToggleInspector
}: Props): React.JSX.Element {
  return (
    <header className="chat-header">
      <div style={{ minWidth: 0 }}>
        <div className="chat-title">{conversation.title}</div>
        <div className="chat-sub">
          <span className="chrome">{messages.length} turns</span>
          <span className="chrome">·</span>
          <span className="chrome">started {formatStartedAt(conversation.createdAt)}</span>
        </div>
      </div>
      <div className="chips">
        <EffortPopover conversation={conversation} />
        <ContextsChip conversation={conversation} />
        <button
          type="button"
          className="inspector-toggle"
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
          title={inspectorOpen ? 'Hide run inspector (⌘.)' : 'Show run inspector (⌘.)'}
        >
          <PanelRight />
          <span>{inspectorOpen ? 'hide inspector' : 'show inspector'}</span>
        </button>
      </div>
    </header>
  )
}
