import { useMutation, useQuery } from '@tanstack/react-query'

import { queryClient } from '@/utils/query'

// The same key the settings form uses, so saving or clearing a provider there
// refreshes the picker without a second source of truth.
const QUERY_KEY = ['errorAnalysisProvider', 'status'] as const

export type AiProvider = 'grafana' | 'custom'

export function useAiProviderStatus() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: window.studio.ai.errorAnalysisGetStatus,
  })
}

/** The provider that will serve the next assistant stream. */
export function useAiProvider(): AiProvider {
  const { data } = useAiProviderStatus()

  return data?.useForAssistant ? 'custom' : 'grafana'
}

export function useSetAiProvider() {
  return useMutation({
    mutationFn: (provider: AiProvider) =>
      window.studio.ai.errorAnalysisSetUseForAssistant(provider === 'custom'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
