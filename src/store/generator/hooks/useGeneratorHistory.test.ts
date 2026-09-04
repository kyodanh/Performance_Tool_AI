import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useGeneratorStore, selectGeneratorData } from '@/store/generator'
import { createProxyData, createRequest } from '@/test/factories/proxyData'
import { exclusionKeyById } from '@/utils/thinkTime'

import { useGeneratorHistory } from './useGeneratorHistory'

function renderHistory() {
  const loaded = selectGeneratorData(useGeneratorStore.getState())

  return renderHook(() => useGeneratorHistory(loaded))
}

describe('useGeneratorHistory', () => {
  beforeEach(() => {
    useGeneratorStore.getState().resetGeneratorFile()
  })

  it('undoes a removed request and redoes it', () => {
    const { setRecording, setAllowlist, toggleExcludedRequest } =
      useGeneratorStore.getState()

    setRecording([
      createProxyData({ id: 'first' }),
      createProxyData({
        id: 'second',
        request: createRequest({ url: 'http://example.com/b' }),
      }),
    ])
    setAllowlist(['example.com'])

    const { result } = renderHistory()

    const key = exclusionKeyById(
      useGeneratorStore.getState().requests,
      'second'
    )
    act(() => toggleExcludedRequest(key!))
    expect(useGeneratorStore.getState().excludedRequests).toEqual([key])

    act(() => {
      expect(result.current('undo')).toBe(true)
    })
    expect(useGeneratorStore.getState().excludedRequests).toEqual([])

    act(() => {
      expect(result.current('redo')).toBe(true)
    })
    expect(useGeneratorStore.getState().excludedRequests).toEqual([key])
  })

  it('reports nothing to undo on an untouched generator', () => {
    const { result } = renderHistory()

    expect(result.current('undo')).toBe(false)
    expect(result.current('redo')).toBe(false)
  })
})
