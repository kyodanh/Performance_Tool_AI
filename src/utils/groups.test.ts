import { describe, expect, it } from 'vitest'

import { sortByGroupOrder } from './groups'

describe('sortByGroupOrder', () => {
  const items = [
    { id: 1, group: 'dashboard' },
    { id: 2, group: 'login' },
    { id: 3, group: 'dashboard' },
    { id: 4, group: 'projects' },
  ]

  const sort = (order: string[]) =>
    sortByGroupOrder(items, order, (item) => item.group).map((item) => item.id)

  it('leaves the items alone when there is no order', () => {
    expect(sort([])).toEqual([1, 2, 3, 4])
  })

  it('orders the groups and keeps the items inside a group in place', () => {
    expect(sort(['login', 'projects', 'dashboard'])).toEqual([2, 4, 1, 3])
  })

  it('puts groups missing from the order last, in their natural order', () => {
    expect(sort(['projects'])).toEqual([4, 1, 2, 3])
  })

  it('ignores names in the order that no item uses', () => {
    expect(sort(['checkout', 'login'])).toEqual([2, 1, 3, 4])
  })
})
