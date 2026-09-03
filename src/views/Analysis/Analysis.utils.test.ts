import { describe, expect, it } from 'vitest'

import { RunResultSummary } from '@/handlers/ui/types'

import { groupRuns, runLabel, runTime } from './Analysis.utils'

const run = (testName: string, ranAt: string): RunResultSummary => ({
  id: `${testName}-${ranAt}.json`,
  testName,
  ranAt,
})

describe('groupRuns', () => {
  it('groups versions per test, newest test and newest version first', () => {
    const projects = groupRuns([
      run('checkout', '2026-08-28T14:47:25Z'),
      run('login', '2026-08-28T12:00:00Z'),
      run('checkout', '2026-08-27T09:00:00Z'),
    ])

    expect(projects.map((project) => project.testName)).toEqual([
      'checkout',
      'login',
    ])
    expect(projects[0]?.runs.map((version) => version.ranAt)).toEqual([
      '2026-08-28T14:47:25Z',
      '2026-08-27T09:00:00Z',
    ])
  })
})

describe('runLabel', () => {
  it('prefers the name the user gave the version', () => {
    const named = {
      ...run('checkout', '2026-08-28T14:47:25Z'),
      label: 'baseline',
    }

    expect(runLabel(named)).toBe('baseline')
    expect(runTime(named)).not.toBeNull()
  })

  it('falls back to when the run ran', () => {
    const version = run('checkout', '2026-08-28T14:47:25Z')

    expect(runLabel(version)).toBe(
      new Date(version.ranAt ?? '').toLocaleString()
    )
    // Unnamed versions are already listed by time, so no second line.
    expect(runTime(version)).toBeNull()
  })
})
