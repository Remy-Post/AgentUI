import { useEffect, useRef, useState } from 'react'
import { persistConfig } from '../hooks/useConfig'

const MIN = 280
const MAX = 520
const DEFAULT = 320

type Props = {
  width: number
  onWidthChange: (next: number) => void
  /** Frame element whose --rail-w we mutate during drag. */
  frameRef: React.RefObject<HTMLDivElement | null>
}

export default function RailHandle({ width, onWidthChange, frameRef }: Props): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<{ x: number; w: number; latest: number } | null>(null)

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent): void => {
      if (!startRef.current) return
      const dx = startRef.current.x - e.clientX
      const next = Math.max(MIN, Math.min(MAX, startRef.current.w + dx))
      startRef.current.latest = next
      const frame = frameRef.current
      if (frame) frame.style.setProperty('--rail-w', `${next}px`)
    }
    const onUp = (): void => {
      const next = startRef.current?.latest ?? width
      setDragging(false)
      startRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onWidthChange(next)
      void persistConfig('inspector.width', next)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, width, onWidthChange, frameRef])

  const handlePointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    setDragging(true)
    startRef.current = { x: e.clientX, w: width, latest: width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const handleDoubleClick = (): void => {
    onWidthChange(DEFAULT)
    void persistConfig('inspector.width', DEFAULT)
    const frame = frameRef.current
    if (frame) frame.style.setProperty('--rail-w', `${DEFAULT}px`)
  }

  return (
    <div
      className={`rail-handle${dragging ? ' dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize run inspector"
    />
  )
}
