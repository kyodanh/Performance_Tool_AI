import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoadGeneratorFacts } from '@/types/loadGenerator'

import { pool } from './pool'
import {
  abortDistributedRun,
  claimOrder,
  getArchivePath,
  isPoolFinished,
  markFinished,
  pushRemoteLines,
  shouldAbort,
  startDistributedRun,
  toProfileFlags,
} from './run'

const FACTS: LoadGeneratorFacts = {
  instance: 'instance-01',
  hostname: 'lg-01',
  user: 'loadtest',
  os: 'linux',
  arch: 'amd64',
  k6Version: 'k6 v2.1.0',
  nofile: '65535',
  ports: '10000-65535',
  clock: Math.round(Date.now() / 1000),
}

function join(hostname: string, ip: string) {
  return pool.join({ ...FACTS, instance: hostname, hostname }, ip)
}

function start(
  {
    includeLocal = true,
    onPoolFinished,
  }: {
    includeLocal?: boolean
    onPoolFinished?: () => void
  } = {},
  onLine = vi.fn()
) {
  return {
    onLine,
    plan: startDistributedRun({
      archivePath: '/tmp/archive.tar',
      profileFlags: ['--vus', '10'],
      onLine,
      includeLocal,
      onPoolFinished,
    }),
  }
}

afterEach(() => {
  for (const generator of pool.list()) {
    pool.leave(generator.id)
  }
})

describe('toProfileFlags', () => {
  it('mirrors the profile the local run gets', () => {
    expect(toProfileFlags({ vus: 10, stages: ['0s:10', '30s:10'] })).toEqual([
      '--vus',
      '10',
      '--stage',
      '0s:10',
      '--stage',
      '30s:10',
    ])
  })
})

describe('startDistributedRun', () => {
  it('runs everything locally when no generator has joined', () => {
    const { plan } = start()

    expect(plan).toEqual({ local: null, runsLocally: true, generators: [] })
  })

  it('gives this machine and one generator half each', () => {
    const generator = join('lg-01', '10.0.0.7')
    const { plan } = start()

    expect(plan.local).toEqual({ segment: '0:1/2', sequence: '0,1/2,1' })

    const order = claimOrder(generator.id)

    expect(order?.flags).toContain('--execution-segment 1/2:1')
    expect(order?.flags).toContain('--execution-segment-sequence 0,1/2,1')
    // The profile stays the total — k6 applies the segment to it.
    expect(order?.flags).toContain('--vus 10')
    expect(order?.flags).toContain('--out csv=-')
  })

  it('hands each order out once, so a re-poll does not start a second run', () => {
    const generator = join('lg-01', '10.0.0.7')

    start()

    expect(claimOrder(generator.id)).not.toBeNull()
    expect(claimOrder(generator.id)).toBeNull()
  })

  it('ignores generators that were not part of the run', () => {
    join('lg-01', '10.0.0.7')

    start()

    expect(claimOrder('never-joined')).toBeNull()
    expect(getArchivePath('never-joined')).toBeNull()
  })

  it('tags output with the host it came from and its clock offset', () => {
    const generator = join('lg-01', '10.0.0.7')
    const { onLine } = start()

    pushRemoteLines(generator.id, ['vus,100,5,,'])

    expect(onLine).toHaveBeenCalledWith(
      'vus,100,5,,',
      'lg-01',
      generator.clockOffset
    )
  })
})

describe('abortDistributedRun', () => {
  it('only tells generators that started to kill their k6', () => {
    const running = join('lg-01', '10.0.0.7')
    const idle = join('lg-02', '10.0.0.9')

    start()
    claimOrder(running.id)

    abortDistributedRun()

    expect(shouldAbort(running.id)).toBe(true)
    expect(shouldAbort(idle.id)).toBe(false)
  })

  it('stops handing out work once aborted', () => {
    const generator = join('lg-01', '10.0.0.7')

    start()
    abortDistributedRun()

    expect(claimOrder(generator.id)).toBeNull()
  })
})

describe('leaving this machine out', () => {
  it('gives the generators the whole load', () => {
    const first = join('lg-01', '10.0.0.7')
    const second = join('lg-02', '10.0.0.9')
    const { plan } = start({ includeLocal: false })

    expect(plan.runsLocally).toBe(false)
    expect(plan.local).toBeNull()

    expect(claimOrder(first.id)?.flags).toContain('--execution-segment 0:1/2')
    expect(claimOrder(second.id)?.flags).toContain('--execution-segment 1/2:1')
  })

  it('refuses to start with nothing to run on', () => {
    expect(() => start({ includeLocal: false })).toThrow(
      /No load generator is available/
    )
  })
})

describe('weights', () => {
  it('splits the load in proportion', () => {
    const light = join('lg-01', '10.0.0.7')
    const heavy = join('lg-02', '10.0.0.9')

    pool.setWeight(heavy.id, 3)
    start({ includeLocal: false })

    expect(claimOrder(light.id)?.flags).toContain('--execution-segment 0:1/4')
    expect(claimOrder(heavy.id)?.flags).toContain('--execution-segment 1/4:1')
  })
})

describe('finishing', () => {
  it('reports the run over once every generator has finished', () => {
    const first = join('lg-01', '10.0.0.7')
    const second = join('lg-02', '10.0.0.9')
    const onPoolFinished = vi.fn()

    start({ includeLocal: false, onPoolFinished })
    claimOrder(first.id)
    claimOrder(second.id)

    markFinished(first.id)
    expect(onPoolFinished).not.toHaveBeenCalled()

    markFinished(second.id)
    expect(onPoolFinished).toHaveBeenCalledTimes(1)
  })

  it('fires once, so a late stream closing cannot end the next run', () => {
    const generator = join('lg-01', '10.0.0.7')
    const onPoolFinished = vi.fn()

    start({ includeLocal: false, onPoolFinished })
    markFinished(generator.id)
    markFinished(generator.id)

    expect(onPoolFinished).toHaveBeenCalledTimes(1)
  })

  it('does not wait for a generator that dropped out of the pool', () => {
    const staying = join('lg-01', '10.0.0.7')
    const leaving = join('lg-02', '10.0.0.9')

    start({ includeLocal: false })

    pool.leave(leaving.id)
    markFinished(staying.id)

    expect(isPoolFinished()).toBe(true)
  })
})
