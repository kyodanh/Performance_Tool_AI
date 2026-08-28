import { describe, expect, it } from 'vitest'

import { nextPinnedState } from './AutoScrollArea'

const size = { scrollHeight: 1000, clientHeight: 200 }

describe('nextPinnedState', () => {
  it('pauses tailing when the user scrolls up away from the bottom', () => {
    expect(
      nextPinnedState(true, { ...size, scrollTop: 400, previousScrollTop: 500 })
    ).toBe(false)
  })

  it('resumes tailing once the user is back at the bottom', () => {
    expect(
      nextPinnedState(false, {
        ...size,
        scrollTop: 795,
        previousScrollTop: 700,
      })
    ).toBe(true)
  })

  it('stays paused while the user scrolls down but not to the bottom', () => {
    expect(
      nextPinnedState(false, {
        ...size,
        scrollTop: 500,
        previousScrollTop: 400,
      })
    ).toBe(false)
  })

  it('keeps tailing while the view follows new items downwards', () => {
    expect(
      nextPinnedState(true, { ...size, scrollTop: 600, previousScrollTop: 500 })
    ).toBe(true)
  })
})
