import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import Modal from './Modal'
import { apiFetch } from '../lib/api'
import {
  CONVERSATION_COLORS,
  CONVERSATION_COLOR_KEYS,
  countWords,
  DESCRIPTION_MAX_WORDS,
  DESCRIPTION_MIN_WORDS,
  TITLE_MIN_CHARS,
  isValidDescription,
  isValidTitle
} from '../lib/conversationColors'
import type { ConversationColor, ConversationDTO } from '@shared/types'

type Props = {
  open: boolean
  onClose: () => void
  conversation: ConversationDTO | null
}

type Draft = {
  title: string
  description: string
  color: ConversationColor | null
}

function fromConversation(c: ConversationDTO | null): Draft {
  return {
    title: c?.title ?? '',
    description: c?.description ?? '',
    color: c?.color ?? null
  }
}

export default function EditConversationModal({
  open,
  onClose,
  conversation
}: Props): React.JSX.Element | null {
  const [draft, setDraft] = useState<Draft>(() => fromConversation(conversation))
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open) setDraft(fromConversation(conversation))
  }, [open, conversation])

  const save = useMutation({
    mutationFn: async () => {
      if (!conversation) throw new Error('no_conversation')
      const body: Record<string, unknown> = {
        title: draft.title.trim(),
        description: draft.description,
        color: draft.color
      }
      return apiFetch<ConversationDTO>(`/api/sessions/${conversation._id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onClose()
    }
  })

  const titleValid = isValidTitle(draft.title)
  const descriptionWords = countWords(draft.description)
  const descriptionValid = isValidDescription(draft.description)
  const isValid = titleValid && descriptionValid

  if (!conversation) return null

  const descriptionHelp = (() => {
    if (descriptionWords === 0) return 'Optional. If filled, must be 10–500 words.'
    if (descriptionWords < DESCRIPTION_MIN_WORDS) {
      return `Need at least ${DESCRIPTION_MIN_WORDS} words (${descriptionWords}).`
    }
    if (descriptionWords > DESCRIPTION_MAX_WORDS) {
      return `Too long: ${descriptionWords}/${DESCRIPTION_MAX_WORDS} words.`
    }
    return `${descriptionWords}/${DESCRIPTION_MAX_WORDS} words.`
  })()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit conversation"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!isValid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Title</label>
        <input
          className="input"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="Conversation title"
        />
        <span
          className="chrome"
          style={{
            display: 'block',
            marginTop: 6,
            color: titleValid ? 'var(--color-muted)' : 'var(--color-error)'
          }}
        >
          {titleValid
            ? `${draft.title.trim().length} characters`
            : `Min ${TITLE_MIN_CHARS} characters (${draft.title.trim().length}).`}
        </span>
      </div>

      <div className="field">
        <label className="field-label">Description</label>
        <textarea
          className="textarea"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="A short summary of this conversation (10–500 words). Leave empty to omit."
        />
        <span
          className="chrome"
          style={{
            display: 'block',
            marginTop: 6,
            color: descriptionValid ? 'var(--color-muted)' : 'var(--color-error)'
          }}
        >
          {descriptionHelp}
        </span>
      </div>

      <div className="field">
        <label className="field-label">Background color</label>
        <div className="conv-color-row">
          <button
            type="button"
            className={`conv-swatch default ${draft.color === null ? 'selected' : ''}`}
            aria-pressed={draft.color === null}
            title="Default (no color)"
            onClick={() => setDraft((d) => ({ ...d, color: null }))}
          >
            {draft.color === null && <Check size={14} />}
          </button>
          {CONVERSATION_COLOR_KEYS.map((key) => {
            const palette = CONVERSATION_COLORS[key]
            const selected = draft.color === key
            return (
              <button
                type="button"
                key={key}
                className={`conv-swatch ${selected ? 'selected' : ''}`}
                aria-pressed={selected}
                title={key}
                style={{
                  background: palette.main,
                  borderColor: palette.side
                }}
                onClick={() => setDraft((d) => ({ ...d, color: key }))}
              >
                <span className="conv-swatch-dot" style={{ background: palette.side }} />
                {selected && (
                  <span className="conv-swatch-check">
                    <Check size={12} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <span className="chrome" style={{ display: 'block', marginTop: 8 }}>
          The list shows the deeper shade; the main interface uses the lighter shade.
        </span>
      </div>

      {save.isError && (
        <div style={{ color: 'var(--color-error)', fontSize: 12 }}>
          Save failed. {save.error instanceof Error ? save.error.message : 'unknown error'}
        </div>
      )}
    </Modal>
  )
}
