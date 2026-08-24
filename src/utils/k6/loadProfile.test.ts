import { describe, expect, it } from 'vitest'

import { newSyntheticKey } from '@/utils/zod'

import {
  describeProfile,
  isRunnableProfile,
  profileSeconds,
  toLoadProfile,
  toProfileOverrides,
} from './loadProfile'

describe('toProfileOverrides', () => {
  it('maps ramping stages to --stage pairs', () => {
    expect(
      toProfileOverrides({
        executor: 'ramping-vus',
        stages: [
          { key: newSyntheticKey(), duration: '30s', target: 100 },
          { key: newSyntheticKey(), duration: '1m', target: 100 },
          { key: newSyntheticKey(), duration: '10s', target: 0 },
        ],
      })
    ).toEqual({ stages: ['30s:100', '1m:100', '10s:0'] })
  })

  it('maps shared iterations to vus and iterations', () => {
    expect(
      toProfileOverrides({
        executor: 'shared-iterations',
        vus: 10,
        iterations: 200,
      })
    ).toEqual({ vus: 10, iterations: 200 })
  })
})

describe('toLoadProfile', () => {
  it('keeps the stages the script declares', () => {
    expect(
      toLoadProfile({ stages: [{ duration: '1m', target: 50 }] })
    ).toMatchObject({
      executor: 'ramping-vus',
      stages: [{ duration: '1m', target: 50 }],
    })
  })

  it('uses shared iterations when the script declares iterations', () => {
    expect(toLoadProfile({ vus: 5, iterations: 50 })).toEqual({
      executor: 'shared-iterations',
      vus: 5,
      iterations: 50,
    })
  })

  it('falls back to a single stage built from vus and duration', () => {
    expect(toLoadProfile({ vus: 20, duration: '2m' })).toMatchObject({
      executor: 'ramping-vus',
      stages: [{ duration: '2m', target: 20 }],
    })
  })

  it('defaults when the script declares no profile', () => {
    expect(toLoadProfile({})).toMatchObject({
      executor: 'ramping-vus',
      stages: [{ duration: '30s', target: 10 }],
    })
  })
})

describe('describeProfile', () => {
  it('reads a stage relative to the one before it', () => {
    expect(
      describeProfile({
        executor: 'ramping-vus',
        stages: [
          { key: newSyntheticKey(), duration: '1m', target: 20 },
          { key: newSyntheticKey(), duration: '3m30s', target: 20 },
          { key: newSyntheticKey(), duration: '1m', target: 0 },
        ],
      })
    ).toBe('0 → 20 VUs over 1m, hold 20 VUs for 3m30s, 20 → 0 VUs over 1m')
  })

  it('summarises shared iterations', () => {
    expect(
      describeProfile({
        executor: 'shared-iterations',
        vus: 100,
        iterations: 100,
      })
    ).toBe('100 VUs sharing 100 iterations')
  })
})

describe('isRunnableProfile', () => {
  it('rejects a ramp with every stage removed', () => {
    expect(isRunnableProfile({ executor: 'ramping-vus', stages: [] })).toBe(
      false
    )
  })

  it('rejects shared iterations with nothing to run', () => {
    expect(isRunnableProfile({ executor: 'shared-iterations', vus: 1 })).toBe(
      false
    )
  })

  it('accepts a profile that schedules work', () => {
    expect(
      isRunnableProfile({
        executor: 'ramping-vus',
        stages: [{ key: newSyntheticKey(), duration: '1m', target: 20 }],
      })
    ).toBe(true)
    expect(
      isRunnableProfile({
        executor: 'shared-iterations',
        vus: 1,
        iterations: 1,
      })
    ).toBe(true)
  })
})

describe('profileSeconds', () => {
  it('sums the stage durations', () => {
    expect(
      profileSeconds({
        executor: 'ramping-vus',
        stages: [
          { key: newSyntheticKey(), duration: '1m40s', target: 100 },
          { key: newSyntheticKey(), duration: '1h', target: 100 },
          { key: newSyntheticKey(), duration: '500ms', target: 0 },
        ],
      })
    ).toBe(3700.5)
  })

  it('has no duration for an iteration-based profile', () => {
    expect(
      profileSeconds({
        executor: 'shared-iterations',
        vus: 10,
        iterations: 100,
      })
    ).toBeNull()
  })

  it('has no duration when nothing is scheduled', () => {
    expect(profileSeconds({ executor: 'ramping-vus', stages: [] })).toBeNull()
  })
})
