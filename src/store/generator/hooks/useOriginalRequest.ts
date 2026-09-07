import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { selectFilteredRequests } from '../selectors'
import { useGeneratorStore } from '../useGeneratorStore'

export function useOriginalRequest(id?: string) {
  // Shallow, because the selector builds a new array every time. This hook is
  // called once per request row, so without it every store write re-ran the
  // whole filter for each of a few hundred rows and re-rendered all of them.
  const requests = useGeneratorStore(useShallow(selectFilteredRequests))

  return useMemo(() => {
    if (!id) {
      return
    }
    return requests.find((request) => request.id === id)?.request
  }, [id, requests])
}
