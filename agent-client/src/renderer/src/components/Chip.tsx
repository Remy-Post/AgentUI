import type { ReactNode } from 'react'

type Props = {
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  ariaPressed?: boolean
}

export default function Chip({ icon, children, onClick, ariaPressed }: Props): React.JSX.Element {
  const className = onClick ? 'chip button' : 'chip'
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={ariaPressed}>
        {icon}
        {children}
      </button>
    )
  }
  return (
    <span className={className}>
      {icon}
      {children}
    </span>
  )
}
