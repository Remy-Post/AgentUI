import { Layers } from 'lucide-react'
import type { ConversationDTO } from '@shared/types'

type Props = {
  conversation: ConversationDTO
}

export default function ContextsChip({ conversation }: Props): React.JSX.Element {
  const skills = conversation.attachedSkillIds?.length ?? 0
  const subagents = conversation.attachedSubagentIds?.length ?? 0
  const total = skills + subagents
  return (
    <span className="chip contexts-chip" title={`${total} contexts`}>
      <Layers size={12} />
      <span className="contexts-count">{total}</span>
      <span className="app-text">contexts</span>
    </span>
  )
}
