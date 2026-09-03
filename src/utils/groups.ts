import { groupBy } from 'lodash-es'

import { DEFAULT_GROUP_NAME } from '@/constants'

export function groupProxyData<T extends { group?: string }>(requests: T[]) {
  return groupBy(requests, (item) => item.group || DEFAULT_GROUP_NAME)
}

/**
 * Orders items by an explicit list of group names. Groups missing from the
 * list keep their natural order at the end, so a group that was never dragged
 * stays where the requests put it.
 */
export function sortByGroupOrder<T>(
  items: T[],
  order: string[],
  getGroup: (item: T) => string
) {
  if (order.length === 0) {
    return items
  }

  const rank = new Map(order.map((name, index) => [name, index]))
  // Unknown groups all rank last, and `sort` is stable, so items keep their
  // relative order both inside a group and among the groups left out.
  const rankOf = (item: T) => rank.get(getGroup(item)) ?? order.length

  return [...items].sort((a, b) => rankOf(a) - rankOf(b))
}
