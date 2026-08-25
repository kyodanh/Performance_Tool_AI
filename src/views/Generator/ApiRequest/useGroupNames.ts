import { useMemo } from 'react'

import { DEFAULT_GROUP_NAME } from '@/constants'
import { useGeneratorStore } from '@/store/generator'

/** Group names already in use, so they can be picked instead of retyped. */
export function useGroupNames() {
  const requests = useGeneratorStore((store) => store.requests)
  const manualRequests = useGeneratorStore((store) => store.manualRequests)
  const emptyGroups = useGeneratorStore((store) => store.emptyGroups)

  return useMemo(
    () =>
      Array.from(
        new Set([
          ...[...requests, ...manualRequests].map(
            ({ group }) => group || DEFAULT_GROUP_NAME
          ),
          ...emptyGroups,
        ])
      ),
    [requests, manualRequests, emptyGroups]
  )
}
