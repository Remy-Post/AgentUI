import { useEffect, useRef, useState } from 'react'

type ModelOption = { id: string; short: string; label: string }

const OPTIONS: ModelOption[] = [
  { id: 'claude-opus-4-7', short: 'opus', label: 'Opus' },
  { id: 'claude-sonnet-4-6', short: 'sonnet', label: 'Sonnet' },
  { id: 'claude-haiku-4-5-20251001', short: 'haiku', label: 'Haiku' }
]

export const ALL_MODEL_IDS: string[] = OPTIONS.map((o) => o.id)

type Props = {
  selected: string[]
  onChange: (next: string[]) => void
  buttonClassName?: string
}

export default function ModelsPopover({
  selected,
  onChange,
  buttonClassName
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (id: string): void => {
    if (selected.includes(id)) {
      if (selected.length === 1) return
      onChange(selected.filter((m) => m !== id))
    } else {
      const next = OPTIONS.map((o) => o.id).filter((mid) => mid === id || selected.includes(mid))
      onChange(next)
    }
  }

  const label =
    selected.length === OPTIONS.length
      ? 'all models'
      : OPTIONS.filter((o) => selected.includes(o.id))
          .map((o) => o.label)
          .join(', ')

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`chip button${buttonClassName ? ` ${buttonClassName}` : ''}`}
        onClick={() => setOpen((s) => !s)}
        aria-pressed={open}
      >
        <span className="model-popover-label">claude · {label}</span>
      </button>
      {open && (
        <div className="popover" style={{ top: 'calc(100% + 6px)', right: 0 }} role="dialog">
          {OPTIONS.map((opt) => {
            const isChecked = selected.includes(opt.id)
            const isLast = isChecked && selected.length === 1
            return (
              <label key={opt.id} className="popover-row">
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isLast}
                  onChange={() => toggle(opt.id)}
                />
                {opt.label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
