type Props = {
  values: number[]
}

export default function SparkBars({ values }: Props): React.JSX.Element {
  const max = Math.max(1, ...values)
  return (
    <div className="spark">
      {values.map((v, i) => {
        const height = Math.max(8, (v / max) * 100)
        const isLast = i === values.length - 1
        return <div key={i} className={isLast ? 'bar now' : 'bar'} style={{ height: `${height}%` }} />
      })}
    </div>
  )
}
