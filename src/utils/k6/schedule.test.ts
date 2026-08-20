import { describe, expect, it } from 'vitest'

import { RampingStageSchema } from '@/schemas/generator'

import {
  DEFAULT_SCHEDULE,
  parseHms,
  scheduleToProfile,
  toK6Duration,
} from './schedule'

describe('parseHms', () => {
  it.each([
    ['00:01:00', 60],
    ['00:00:15', 15],
    ['01:30:00', 5400],
    ['05:00', 300],
    ['nonsense', 0],
  ])('parses %s', (value, expected) => {
    expect(parseHms(value)).toBe(expected)
  })
})

describe('toK6Duration', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [60, '1m'],
    [90, '1m30s'],
    [3600, '1h'],
    [3660, '1h1m'],
    [3690, '1h1m30s'],
  ])('formats %i seconds', (seconds, expected) => {
    expect(toK6Duration(seconds)).toBe(expected)
  })

  it('only emits durations the stage schema accepts', () => {
    for (const seconds of [0, 1, 59, 60, 61, 3599, 3600, 3601, 86399]) {
      expect(
        RampingStageSchema.safeParse({
          target: 1,
          duration: toK6Duration(seconds),
        }).success
      ).toBe(true)
    }
  })
})

describe('scheduleToProfile', () => {
  it('starts all VUs at once and holds them', () => {
    expect(scheduleToProfile(DEFAULT_SCHEDULE)).toMatchObject({
      executor: 'ramping-vus',
      stages: [
        { duration: '0s', target: 100 },
        { duration: '5m', target: 100 },
      ],
    })
  })

  it('turns a stepped start into a linear ramp of the same length', () => {
    expect(
      scheduleToProfile({
        ...DEFAULT_SCHEDULE,
        vus: 50,
        startMode: 'gradual',
        stepVus: 5,
        stepEvery: '00:00:10',
      })
    ).toMatchObject({
      // 10 steps of 10s
      stages: [
        { duration: '1m40s', target: 50 },
        { duration: '5m', target: 50 },
      ],
    })
  })

  it('runs one iteration per VU when running until completion', () => {
    expect(
      scheduleToProfile({ ...DEFAULT_SCHEDULE, durationMode: 'completion' })
    ).toEqual({ executor: 'shared-iterations', vus: 100, iterations: 100 })
  })
})
