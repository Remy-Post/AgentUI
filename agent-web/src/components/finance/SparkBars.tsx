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
        const classes = ['bar']
        if (isLast && !hasSelection) classes.push('now')
        if (isSelected) classes.push('selected')
        return (
          <div
            key={i}
            className={classes.join(' ')}
            style={{ height: `${height}%`, cursor: onSelect ? 'pointer' : undefined }}
            onClick={onSelect ? () => onSelect(i) : undefined}
          />
        )
      })}
    </div>
  )
}
