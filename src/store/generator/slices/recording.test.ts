import { beforeEach, describe, expect, it } from 'vitest'

import { createProxyData } from '@/test/factories/proxyData'

import { useGeneratorStore } from '../useGeneratorStore'

beforeEach(() => {
  useGeneratorStore.getState().resetGeneratorFile()
})

describe('renameGroup', () => {
  it('renames the group on recorded and manual requests alike', () => {
    const { setRecording, addManualRequest, renameGroup } =
      useGeneratorStore.getState()

    setRecording([createProxyData({ id: 'recorded', group: 'Login' })])
    addManualRequest(createProxyData({ id: 'manual', group: 'Login' }))

    renameGroup('Login', 'transaction_login')

    const { requests, manualRequests } = useGeneratorStore.getState()
    expect(requests[0]?.group).toBe('transaction_login')
    expect(manualRequests[0]?.group).toBe('transaction_login')
  })

  it('renames requests that fall back to the default group name', () => {
    const { addManualRequest, renameGroup } = useGeneratorStore.getState()

    // A HAR without a pageref leaves the group empty.
    addManualRequest(createProxyData({ id: 'manual', group: '' }))

    renameGroup('Default group', 'transaction_login')

    expect(useGeneratorStore.getState().manualRequests[0]?.group).toBe(
      'transaction_login'
    )
  })

  it('renames a group that holds no requests yet', () => {
    const { addGroup, renameGroup } = useGeneratorStore.getState()

    addGroup('Group 1')
    renameGroup('Group 1', 'trans_view')

    expect(useGeneratorStore.getState().emptyGroups).toEqual(['trans_view'])
  })

  it('leaves other groups alone', () => {
    const { addManualRequest, renameGroup } = useGeneratorStore.getState()

    addManualRequest(createProxyData({ id: 'manual', group: 'Checkout' }))
    renameGroup('Login', 'transaction_login')

    expect(useGeneratorStore.getState().manualRequests[0]?.group).toBe(
      'Checkout'
    )
  })
})
