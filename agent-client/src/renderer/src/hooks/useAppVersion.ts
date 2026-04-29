import { useQuery } from '@tanstack/react-query'

export function useAppVersion(): string {
  const { data } = useQuery({
    queryKey: ['app-version'],
    queryFn: () => window.api.getAppVersion(),
    staleTime: Infinity,
  })
  return data ?? ''
}
