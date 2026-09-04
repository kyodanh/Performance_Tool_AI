import { describe, expect, it } from 'vitest'

import { rawPath } from './url'

describe('rawPath', () => {
  it('keeps template markers unencoded', () => {
    expect(rawPath('https://example.com/contacts/{token}')).toBe(
      '/contacts/{token}'
    )
  })

  it('keeps the query and drops the hash', () => {
    expect(rawPath('https://example.com/a?b={c}#frag')).toBe('/a?b={c}')
  })

  it('defaults to root when there is no path', () => {
    expect(rawPath('https://example.com')).toBe('/')
  })
})
