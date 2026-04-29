import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CornerDownLeft } from 'lucide-react'

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
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 220)}px`
  }, [value])

  const handleSubmit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <div className="composer">
      <div className="composer-shell">
        <textarea
          ref={ref}
          className="composer-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          rows={1}
          placeholder={disabled ? 'Streaming…' : 'Ask Claude anything…'}
        />
        <div className="composer-row">
          <div className="composer-meta">
            <span className="chrome" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CornerDownLeft size={12} /> Enter to send
            </span>
            <span className="chrome">·</span>
            <span className="chrome mono">{value.length} chars</span>
          </div>
          <button
            type="button"
            className="send-btn"
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            title="Send"
          >
            <ArrowRight size={12} />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
