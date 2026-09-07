import Fuse, { FuseOptionKey } from 'fuse.js'
import { useState, useMemo } from 'react'
import { useDebounce, useLocalStorage } from 'react-use'

import { ProxyData } from '@/types'
import { withMatches } from '@/utils/fuse'
import { getContentType } from '@/utils/headers'
import { isNonStaticAssetResponse } from '@/utils/staticAssets'

import { parseParams } from './RequestDetails/utils'
import { parseContent, toFormat } from './ResponseDetails/ResponseDetails.utils'

export function useFilterRequests({
  proxyData,
  includeStaticAssets = true,
}: {
  proxyData: ProxyData[]
  includeStaticAssets?: boolean
}) {
  const [filter, setFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState(filter)
  const [filterAllData, setFilterAllData] = useLocalStorage(
    'filterAllData',
    true
  )

  const requestWithoutStaticAssets = useMemo(
    () => proxyData.filter(isNonStaticAssetResponse),
    [proxyData]
  )

  const assetsToFilter = includeStaticAssets
    ? proxyData
    : requestWithoutStaticAssets

  useDebounce(
    () => {
      setDebouncedFilter(filter)
    },
    300,
    [filter]
  )

  const isSearching =
    !debouncedFilter.match(/^\s*$/) && debouncedFilter.length >= 2

  // Indexing is deferred until something is actually searched for. Building it
  // walks every key of every request - `response.content` alone parses each
  // recorded body - and the request list rebuilds this hook's input on every
  // edit, so an eagerly built index cost a full re-index per keystroke in the
  // rule editor while the filter box sat empty.
  const searchIndex = useMemo(() => {
    if (!isSearching) {
      return null
    }

    return new Fuse(assetsToFilter, {
      includeMatches: true,
      shouldSort: false,
      useExtendedSearch: true,

      keys: filterAllData
        ? [...basicSearchKeys, ...fullSearchKeys]
        : basicSearchKeys,
    })
  }, [assetsToFilter, filterAllData, isSearching])

  const filteredRequests = useMemo(() => {
    // skip single char queries
    if (searchIndex === null) {
      return assetsToFilter
    }

    // Use '<query> to search for exact matches
    return searchIndex.search(`'"${debouncedFilter}"`).map(withMatches)
  }, [searchIndex, assetsToFilter, debouncedFilter])

  const staticAssetCount = proxyData.length - requestWithoutStaticAssets.length

  return {
    filter,
    setFilter,
    filteredRequests,
    staticAssetCount,
    filterAllData,
    setFilterAllData,
  }
}

const basicSearchKeys: Array<FuseOptionKey<ProxyData>> = [
  'request.path',
  'request.host',
  'request.method',
  'response.statusCode',
  'request.url',
]

const fullSearchKeys: Array<FuseOptionKey<ProxyData>> = [
  // Headers, cookies and query params are arrays of [key, value] tuples. Fuse
  // stringifies each tuple as "key,value", which would make the match value
  // differ from the individual key/value cells rendered in the inspector.
  // Flatten the tuples so each key and value is searched (and matched) on its own.
  { name: 'request.cookies', getFn: (data) => data.request.cookies.flat() },
  { name: 'request.headers', getFn: (data) => data.request.headers.flat() },
  { name: 'request.query', getFn: (data) => data.request.query.flat() },
  {
    name: 'response.cookies',
    getFn: (data) => data.response?.cookies.flat() ?? [],
  },
  {
    name: 'response.headers',
    getFn: (data) => data.response?.headers.flat() ?? [],
  },
  {
    name: 'response.content',
    getFn: (data) => {
      if (!data.response) {
        return ''
      }

      const contentType = getContentType(data.response?.headers ?? [])
      const format = toFormat(contentType)

      // Skip non-text content
      if (!format || ['audio', 'font', 'image', 'video'].includes(format)) {
        return ''
      }

      return parseContent(format, data) ?? ''
    },
  },
  {
    name: 'request.content',
    getFn: (data) => parseParams(data.request) ?? '',
  },
]
