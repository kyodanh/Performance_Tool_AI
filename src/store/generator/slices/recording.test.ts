import { beforeEach, describe, expect, it } from 'vitest'

import { createProxyData, createRequest } from '@/test/factories/proxyData'
import { requestKey } from '@/utils/thinkTime'

import { selectFilteredRequests } from '../selectors'
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

describe('toggleExcludedRequest', () => {
  it('drops the excluded request from the filtered set and puts it back', () => {
    const { setRecording, setAllowlist, toggleExcludedRequest } =
      useGeneratorStore.getState()

    setRecording([
      createProxyData({ id: 'kept' }),
      createProxyData({
        id: 'removed',
        request: createRequest({ url: 'http://example.com/b' }),
      }),
    ])
    setAllowlist(['example.com'])
    const removedKey = requestKey(useGeneratorStore.getState().requests[1]!)

    toggleExcludedRequest(removedKey)
    expect(
      selectFilteredRequests(useGeneratorStore.getState()).map(({ id }) => id)
    ).toEqual(['kept'])

    // The same call is the undo, and what the toast action runs.
    toggleExcludedRequest(removedKey)
    expect(
      selectFilteredRequests(useGeneratorStore.getState()).map(({ id }) => id)
    ).toEqual(['kept', 'removed'])
  })

  it('excludes identical requests loaded again under a fresh id', () => {
    const { setRecording, setAllowlist, toggleExcludedRequest } =
      useGeneratorStore.getState()

    setRecording([createProxyData({ id: 'first-load' })])
    setAllowlist(['example.com'])
    toggleExcludedRequest(requestKey(useGeneratorStore.getState().requests[0]!))

    setRecording([createProxyData({ id: 'second-load' })])

    expect(selectFilteredRequests(useGeneratorStore.getState())).toEqual([])
  })

  it('keeps manual requests out of it, those are removed for good', () => {
    const { addManualRequest, removeManualRequest } =
      useGeneratorStore.getState()

    addManualRequest(createProxyData({ id: 'manual' }))
    removeManualRequest('manual')

    expect(useGeneratorStore.getState().excludedRequests).toEqual([])
    expect(selectFilteredRequests(useGeneratorStore.getState())).toEqual([])
  })
})

describe('setRequestOverride', () => {
  it('replaces the recorded request in place and reverts', () => {
    const { setRecording, setAllowlist, setRequestOverride } =
      useGeneratorStore.getState()

    setRecording([
      createProxyData({ id: 'first' }),
      createProxyData({
        id: 'second',
        request: createRequest({ url: 'http://example.com/b' }),
      }),
    ])
    setAllowlist(['example.com'])
    const key = requestKey(useGeneratorStore.getState().requests[0]!)

    setRequestOverride(
      key,
      createProxyData({
        id: 'edited',
        request: createRequest({ url: 'http://example.com/edited' }),
      })
    )

    // Edited in place: an override must not push the request to the end like a
    // manual request would.
    expect(
      selectFilteredRequests(useGeneratorStore.getState()).map(
        ({ request }) => request.url
      )
    ).toEqual(['http://example.com/edited', 'http://example.com/b'])

    useGeneratorStore.getState().clearRequestOverride(key)
    expect(
      selectFilteredRequests(useGeneratorStore.getState()).map(
        ({ request }) => request.url
      )
    ).toEqual(['http://example.com', 'http://example.com/b'])
  })

  it('survives loading the recording again under fresh ids', () => {
    const { setRecording, setAllowlist, setRequestOverride } =
      useGeneratorStore.getState()

    setRecording([createProxyData({ id: 'first-load' })])
    setAllowlist(['example.com'])
    setRequestOverride(
      requestKey(useGeneratorStore.getState().requests[0]!),
      createProxyData({ id: 'edited', group: 'Checkout' })
    )

    setRecording([createProxyData({ id: 'second-load' })])

    const [request] = selectFilteredRequests(useGeneratorStore.getState())
    expect(request?.group).toBe('Checkout')
    // The row keeps the recorded id so the rest of the UI still matches it up.
    expect(request?.id).toBe('second-load')
  })
})
