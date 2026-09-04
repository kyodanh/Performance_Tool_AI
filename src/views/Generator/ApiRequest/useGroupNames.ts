import { useMemo } from 'react'

import { DEFAULT_GROUP_NAME } from '@/constants'
import { GeneratorStore, useGeneratorStore } from '@/store/generator'

type GroupNameState = Pick<
  GeneratorStore,
  | 'requests'
  | 'manualRequests'
  | 'emptyGroups'
  | 'groupRenames'
  | 'requestOverrides'
>

/** Group names already in use, so they can be picked instead of retyped. */
export function selectGroupNames(state: GroupNameState) {
  return Array.from(
    new Set([
      // Recorded requests carry the name they were recorded with, so a
      // renamed group only shows up under its new name through the map.
      ...[...state.requests, ...state.manualRequests].map(({ group }) => {
        const name = group || DEFAULT_GROUP_NAME

        return state.groupRenames[name] ?? name
      }),
      // A group can exist only on an edited recorded request - moving one into
      // a new group is stored as an override. `renameGroup` rewrites those in
      // place, so they are already under their current name.
      ...Object.values(state.requestOverrides).map(
        ({ group }) => group || DEFAULT_GROUP_NAME
      ),
      ...state.emptyGroups,
    ])
  )
}

export function useGroupNames() {
  const requests = useGeneratorStore((store) => store.requests)
  const manualRequests = useGeneratorStore((store) => store.manualRequests)
  const emptyGroups = useGeneratorStore((store) => store.emptyGroups)
  const groupRenames = useGeneratorStore((store) => store.groupRenames)
  const requestOverrides = useGeneratorStore((store) => store.requestOverrides)

  return useMemo(
    () =>
      selectGroupNames({
        requests,
        manualRequests,
        emptyGroups,
        groupRenames,
        requestOverrides,
      }),
    [requests, manualRequests, emptyGroups, groupRenames, requestOverrides]
  )
}
