import { useServerStatus } from '../hooks/useServerStatus'

export default function StatusDot(): React.JSX.Element {
  const status = useServerStatus()
  const labelByStatus = {
    connected: 'connected',
    checking: 'checking',
    'server-unreachable': 'server offline',
    'db-down': 'db down',
    'sdk-not-ready': 'sdk error'
  } satisfies Record<typeof status, string>
  const classByStatus = {
    connected: 'status-dot',
    checking: 'status-dot checking',
    'server-unreachable': 'status-dot disconnected',
    'db-down': 'status-dot warning',
    'sdk-not-ready': 'status-dot warning'
  } satisfies Record<typeof status, string>
  const label = labelByStatus[status]
  const className = classByStatus[status]
  const accessibleLabel = `Server status: ${label}`
  return (
    <span
      className={className}
      role="status"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    />
  )
}
