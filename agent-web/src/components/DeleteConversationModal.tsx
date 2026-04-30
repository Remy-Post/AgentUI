import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from './Modal'
import { apiFetch } from '../lib/api'
import type { ConversationDTO } from '@shared/types'

type Props = {
  open: boolean
  onClose: () => void
  conversation: ConversationDTO | null
  onDeleted?: (id: string) => void
}

export default function DeleteConversationModal({
  open,
  onClose,
  conversation,
  onDeleted
}: Props): React.JSX.Element | null {
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: async () => {
      if (!conversation) throw new Error('no_conversation')
      return apiFetch<void>(`/api/sessions/${conversation._id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      const id = conversation?._id
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (id && onDeleted) onDeleted(id)
      onClose()
    }
  })

  if (!conversation) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete conversation"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-ink-2)' }}>
        Delete <strong>&quot;{conversation.title}&quot;</strong>? This permanently removes the
        conversation, all of its messages, and any attached GitHub context.
      </p>
      {remove.isError && (
        <div style={{ marginTop: 12, color: 'var(--color-error)', fontSize: 12 }}>
          Delete failed. {remove.error instanceof Error ? remove.error.message : 'unknown error'}
        </div>
      )}
    </Modal>
  )
}
