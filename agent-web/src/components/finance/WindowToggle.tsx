import type { FinanceWindow } from '../../hooks/useFinance'

const ORDER: FinanceWindow[] = ['24h', '7d', '30d', 'all']

const SHORT_LABEL: Record<FinanceWindow, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  all: 'ALL'
}

const FULL_LABEL: Record<FinanceWindow, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'This month',
  all: 'All time'
}

type Props = {
  value: FinanceWindow
  onChange: (next: FinanceWindow) => void
  className?: string
}

export default function WindowToggle({ value, onChange, className }: Props): React.JSX.Element {
  const cycle = (): void => {
    const next = ORDER[(ORDER.indexOf(value) + 1) % ORDER.length]
    onChange(next)
  }
  const cls = ['chip', 'button', 'window-toggle', className].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={cls}
      onClick={cycle}
      title={`${FULL_LABEL[value]} (click to change)`}
      aria-label={`Time window: ${FULL_LABEL[value]}. Click to change.`}
    >
      {SHORT_LABEL[value]}
    </button>
  )
}
