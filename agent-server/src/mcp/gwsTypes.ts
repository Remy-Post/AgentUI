export const GOOGLE_WORKSPACE_SERVICES = ['drive', 'gmail', 'calendar', 'sheets', 'docs', 'tasks'] as const

export type GoogleWorkspaceService = (typeof GOOGLE_WORKSPACE_SERVICES)[number]

export const GOOGLE_WORKSPACE_SERVICE_TOOL_IDS: Record<GoogleWorkspaceService, string> = {
  drive: 'google.workspace.drive',
  gmail: 'google.workspace.gmail',
  calendar: 'google.workspace.calendar',
  sheets: 'google.workspace.sheets',
  docs: 'google.workspace.docs',
  tasks: 'google.workspace.tasks',
}

const SERVICE_SET = new Set<string>(GOOGLE_WORKSPACE_SERVICES)

export function isGoogleWorkspaceService(value: string): value is GoogleWorkspaceService {
  return SERVICE_SET.has(value)
}

export function googleWorkspaceServiceFromToolId(id: string): GoogleWorkspaceService | null {
  for (const service of GOOGLE_WORKSPACE_SERVICES) {
    if (GOOGLE_WORKSPACE_SERVICE_TOOL_IDS[service] === id) return service
  }
  return null
}

export function isGoogleWorkspaceToolId(id: string): boolean {
  return googleWorkspaceServiceFromToolId(id) !== null
}

export function uniqueGoogleWorkspaceServices(values: Iterable<string> | undefined): GoogleWorkspaceService[] {
  const out: GoogleWorkspaceService[] = []
  const seen = new Set<GoogleWorkspaceService>()
  for (const value of values ?? []) {
    if (!isGoogleWorkspaceService(value) || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export function parseAllowedGoogleWorkspaceServices(value: string | undefined): GoogleWorkspaceService[] {
  if (!value || value.trim().length === 0) return [...GOOGLE_WORKSPACE_SERVICES]
  const raw = value
    .split(',')
    .map((service) => service.trim().toLowerCase())
    .filter(Boolean)

  const services = uniqueGoogleWorkspaceServices(raw)
  const invalid = raw.filter((service) => !isGoogleWorkspaceService(service))
  if (invalid.length > 0) {
    throw new Error(`Unsupported Google Workspace service(s): ${invalid.join(', ')}`)
  }
  return services
}

