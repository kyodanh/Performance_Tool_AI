import { describe, expect, it } from 'vitest'

import { createProxyData } from '@/test/factories/proxyData'

import { selectGroupNames } from './useGroupNames'

describe('selectGroupNames', () => {
  it('lists a group that only exists on an edited request', () => {
    const names = selectGroupNames({
      requests: [createProxyData({ group: 'Default group' })],
      manualRequests: [],
      emptyGroups: [],
      groupRenames: {},
      requestOverrides: {
        'GET http://example.com': createProxyData({ group: 'Trans_ThemMoi' }),
      },
    })

    expect(names).toEqual(['Default group', 'Trans_ThemMoi'])
  })

  it('shows a renamed recorded group under its new name only', () => {
    const names = selectGroupNames({
      requests: [createProxyData({ group: 'Default group' })],
      manualRequests: [],
      emptyGroups: [],
      groupRenames: { 'Default group': 'Login' },
      requestOverrides: {},
    })

    expect(names).toEqual(['Login'])
  })
})
