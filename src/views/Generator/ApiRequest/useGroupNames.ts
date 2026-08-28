import { useMemo } from 'react'

import { DEFAULT_GROUP_NAME } from '@/constants'
import { useGeneratorStore } from '@/store/generator'

/** Group names already in use, so they can be picked instead of retyped. */
export function useGroupNames() {
  const requests = useGeneratorStore((store) => store.requests)
  const manualRequests = useGeneratorStore((store) => store.manualRequests)
  const emptyGroups = useGeneratorStore((store) => store.emptyGroups)
  const groupRenames = useGeneratorStore((store) => store.groupRenames)

  return useMemo(
    () =>
      Array.from(
        new Set([
          // Recorded requests carry the name they were recorded with, so a
          // renamed group only shows up under its new name through the map.
          ...[...requests, ...manualRequests].map(({ group }) => {
            const name = group || DEFAULT_GROUP_NAME

            return groupRenames[name] ?? name
          }),
          ...emptyGroups,
        ])
      ),
    [requests, manualRequests, emptyGroups, groupRenames]
  )
}
