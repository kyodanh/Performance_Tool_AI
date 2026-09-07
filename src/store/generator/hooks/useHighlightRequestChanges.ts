import { diffWords } from 'diff'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { KeyValueTuple, ProxyDataWithMatches } from '@/types'
import { Match } from '@/types/fuse'
import { diffChangesToFuseIndices } from '@/utils/diff'

import { selectFilteredRequests, useGeneratorStore } from '..'

export function useHighlightRequestChanges(
  requests: ProxyDataWithMatches[]
): ProxyDataWithMatches[] {
  // Shallow, for the same reason as in `useApplyRules`: the selector builds a
  // new array on every store write, and without this every row would get a
  // fresh object and re-render - a few hundred components each.
  const originalRequests = useGeneratorStore(useShallow(selectFilteredRequests))

  // A lookup rather than a `find` per row: the pass runs over the whole
  // recording on every edit, and the linear scan made it quadratic.
  const originalById = useMemo(
    () => new Map(originalRequests.map((request) => [request.id, request])),
    [originalRequests]
  )

  return useMemo(() => {
    return requests.map((data) => {
      const original = originalById.get(data.id)

      if (!original) {
        return data
      }

      // `applyRules` hands back the untouched request object for every row no
      // rule rewrote, so identity alone says there is nothing to diff. Without
      // this, a recording of a few hundred requests ran `diffWords` over every
      // header, cookie and query param of all of them on each keystroke in the
      // rule editor.
      if (original === data || original.request === data.request) {
        return data
      }

      return addHighlights(original.request, data)
    })
  }, [requests, originalById])
}

function addHighlights(
  originalRequest: ProxyDataWithMatches['request'],
  data: ProxyDataWithMatches
) {
  // Don't overwrite search matches when present
  if (data?.matches && data?.matches.length > 0) {
    return data
  }

  const modified = data?.request

  if (!originalRequest || !modified) {
    return data
  }

  const requestHeaderMatches = getKeyValueTupleHighlights(
    originalRequest.headers,
    modified.headers,
    'request.header.value'
  )

  const requestCookieMatches = getKeyValueTupleHighlights(
    originalRequest.cookies,
    modified.cookies,
    'request.cookie.value'
  )

  const queryMatches = getKeyValueTupleHighlights(
    originalRequest.query,
    modified.query,
    'request.query.value'
  )

  const urlMatches = getStringHighlights(
    originalRequest.url,
    modified.url,
    'request.url'
  )

  const pathMatches = getStringHighlights(
    originalRequest.path,
    modified.path,
    'request.path'
  )

  const hostMatches = getStringHighlights(
    originalRequest.host,
    modified.host,
    'request.host'
  )

  const matches = [
    ...requestHeaderMatches,
    ...requestCookieMatches,
    ...queryMatches,
    urlMatches,
    pathMatches,
    hostMatches,
  ]

  // A rule rewrites a handful of requests but `applyRules` hands back every
  // one of them, so most rows have nothing to highlight. Returning the row
  // untouched keeps its identity, and with it the `memo` on the row.
  if (matches.every(({ indices }) => indices.length === 0)) {
    return data
  }

  return { ...data, matches }
}

function getStringHighlights(
  original: string,
  modified: string,
  key: string
): Match {
  const diff = diffWords(original, modified)

  return {
    indices: diffChangesToFuseIndices(diff),
    value: modified,
    color: 'green',
    key,
  }
}

function getKeyValueTupleHighlights(
  originalValues: KeyValueTuple[],
  values: KeyValueTuple[],
  key: string
) {
  return values.map(([_, value], index): Match => {
    const originalValue = originalValues[index]?.[1]

    return getStringHighlights(originalValue ?? '', value, key)
  })
}
