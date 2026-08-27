import { describe, expect, it } from 'vitest'

import { computeSegments } from './segments'

describe('computeSegments', () => {
  it('splits evenly between two generators', () => {
    expect(computeSegments([1, 1])).toEqual([
      { segment: '0:1/2', sequence: '0,1/2,1' },
      { segment: '1/2:1', sequence: '0,1/2,1' },
    ])
  })

  it('honours weights', () => {
    expect(computeSegments([1, 1, 2])).toEqual([
      { segment: '0:1/4', sequence: '0,1/4,1/2,1' },
      { segment: '1/4:1/2', sequence: '0,1/4,1/2,1' },
      { segment: '1/2:1', sequence: '0,1/4,1/2,1' },
    ])
  })

  it('covers the whole range without gaps or overlap', () => {
    const segments = computeSegments([3, 1, 5, 2])
    const bounds = segments.map(({ segment }) => segment.split(':'))

    expect(bounds[0]?.[0]).toBe('0')
    expect(bounds[bounds.length - 1]?.[1]).toBe('1')

    for (const [index, [, end]] of bounds.entries()) {
      if (index < bounds.length - 1) {
        expect(bounds[index + 1]?.[0]).toBe(end)
      }
    }
  })

  it('gives a single generator the whole range', () => {
    expect(computeSegments([1])).toEqual([{ segment: '0:1', sequence: '0,1' }])
  })

  it('rejects weights that would produce an empty segment', () => {
    expect(() => computeSegments([1, 0])).toThrow(/positive whole numbers/)
    expect(() => computeSegments([1.5, 1])).toThrow(/positive whole numbers/)
  })

  it('returns nothing for no generators', () => {
    expect(computeSegments([])).toEqual([])
  })
})
