import { cx } from '../../lib/classes'

type Props = {
  values: number[]
  selectedIndex?: number | null
  onSelect?: (index: number) => void
}

export default function SparkBars({
  values,
  selectedIndex,
  onSelect
}: Props): React.JSX.Element {
  const max = Math.max(1, ...values)
  return (
    <div className="spark">
      {values.map((v, i) => {
        const height = Math.max(8, (v / max) * 100)
        const isLast = i === values.length - 1
        const isSelected = selectedIndex === i
        const hasSelection = selectedIndex != null
        return (
          <div
            key={i}
            className={cx('bar', isLast && !hasSelection && 'now', isSelected && 'selected')}
            style={{ height: `${height}%`, cursor: onSelect ? 'pointer' : undefined }}
            onClick={onSelect ? () => onSelect(i) : undefined}
          />
        )
      })}
    </div>
  )
}
