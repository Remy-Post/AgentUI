export function nz(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
