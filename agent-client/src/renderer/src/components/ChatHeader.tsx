import { PanelRight } from 'lucide-react'
import EffortToggle from './EffortToggle'
import ContextsChip from './ContextsChip'
import { useKeybindShortcut } from '../hooks/useKeybinds'
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
  const inspectorShortcut = useKeybindShortcut('inspector.toggle')
  const inspectorLabel = inspectorOpen ? 'Hide run inspector' : 'Show run inspector'
  const inspectorTitle = inspectorShortcut
    ? `${inspectorLabel} (${inspectorShortcut})`
    : inspectorLabel

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
        <EffortToggle conversation={conversation} />
        <ContextsChip conversation={conversation} />
        <button
          type="button"
          className="inspector-toggle"
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
          title={inspectorTitle}
        >
          <PanelRight />
        </button>
      </div>
    </header>
  )
}
