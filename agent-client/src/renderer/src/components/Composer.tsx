import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'

type Props = {
  disabled: boolean
  onSubmit: (content: string) => void
}

export default function Composer({ disabled, onSubmit }: Props): React.JSX.Element {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 200)}px`
  }, [value])

  const handleSubmit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="flex items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          rows={1}
          placeholder={disabled ? 'Streaming...' : 'Send a message (Enter to send, Shift+Enter for newline)'}
          className="flex-1 resize-none bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="rounded-md bg-blue-600 p-2 text-white disabled:bg-zinc-700 disabled:text-zinc-500"
          title="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
