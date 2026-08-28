import { describe, expect, it, vi } from 'vitest'

import { createRequest } from '@/test/factories/proxyData'

import { parseParams } from './utils'

describe('parseParams', () => {
  it('skips parsing a query-only request instead of failing on an empty body', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const request = createRequest({
      method: 'GET',
      query: [['type', 'system']],
      content: null,
    })

    expect(parseParams(request)).toBeUndefined()
    expect(info).not.toHaveBeenCalled()

    info.mockRestore()
  })

  it.each([
    ['an empty python byte string', "b''"],
    ['a whitespace-only body', '   '],
  ])('skips %s instead of failing on it', (_label, body) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const request = createRequest({
      method: 'POST',
      content: btoa(body),
    })

    expect(parseParams(request)).toBeUndefined()
    expect(info).not.toHaveBeenCalled()

    info.mockRestore()
  })

  it('still parses a real json body', () => {
    const request = createRequest({
      method: 'POST',
      content: btoa('{"user":"danh"}'),
    })

    expect(parseParams(request)).toContain('"user"')
  })
})
