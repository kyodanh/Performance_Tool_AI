import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { LoadGeneratorFacts } from '@/types/loadGenerator'

import { LoadGeneratorPool } from './pool'

const FACTS: LoadGeneratorFacts = {
  instance: 'instance-01',
  hostname: 'lg-01',
  user: 'loadtest',
  os: 'linux',
  arch: 'amd64',
  k6Version: 'k6 v2.1.0',
  nofile: '65535',
  ports: '10000-65535',
  clock: 1_700_000_000,
}

describe('LoadGeneratorPool', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FACTS.clock * 1000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports the clock offset it measured at join time', () => {
    const pool = new LoadGeneratorPool()

    vi.setSystemTime((FACTS.clock + 3) * 1000)

    expect(pool.join(FACTS, '10.0.0.7').clockOffset).toBe(3)
  })

  it('replaces the previous entry when the same joiner rejoins', () => {
    const pool = new LoadGeneratorPool()

    const first = pool.join(FACTS, '10.0.0.7')
    // A rejoin after a controller restart, reported from a new address.
    const second = pool.join(FACTS, '10.0.0.8')

    expect(pool.list().map((generator) => generator.id)).toEqual([second.id])
    expect(second.id).not.toBe(first.id)
  })

  it('keeps generators from different machines apart', () => {
    const pool = new LoadGeneratorPool()

    pool.join({ ...FACTS, instance: 'a' }, '10.0.0.7')
    pool.join({ ...FACTS, instance: 'b' }, '10.0.0.9')

    expect(pool.list()).toHaveLength(2)
  })

  it('keeps two joiners on one machine apart, rather than evicting each other', () => {
    const pool = new LoadGeneratorPool()

    pool.join({ ...FACTS, instance: 'a' }, '10.0.0.7')
    pool.join({ ...FACTS, instance: 'b' }, '10.0.0.7')

    expect(pool.list()).toHaveLength(2)
  })

  it('goes offline once heartbeats stop, and recovers when they resume', () => {
    const pool = new LoadGeneratorPool()
    const { id } = pool.join(FACTS, '10.0.0.7')

    vi.advanceTimersByTime(20_000)
    expect(pool.list()[0]?.status).toBe('offline')

    expect(pool.beat(id)).toEqual({ stop: false })
    expect(pool.list()[0]?.status).toBe('ready')
  })

  it('only drops a disconnected generator once its joiner acknowledges', () => {
    const pool = new LoadGeneratorPool()
    const { id } = pool.join(FACTS, '10.0.0.7')

    pool.disconnect(id)
    expect(pool.list()).toHaveLength(1)

    expect(pool.beat(id)).toEqual({ stop: true })
    expect(pool.list()).toHaveLength(0)
  })

  it('does not recognise a generator the controller never joined', () => {
    expect(new LoadGeneratorPool().beat('missing')).toBeNull()
  })
})

// The server fills these in before serving. A renamed placeholder would ship a
// script that calls `__CONTROLLER__` instead of the controller.
describe('joiner scripts', () => {
  it.each(['join.sh', 'join.ps1'])('%s carries every placeholder', (name) => {
    const script = readFileSync(
      join(process.cwd(), 'resources', 'loadGenerator', name),
      'utf-8'
    )

    expect(script).toContain('__CONTROLLER__')
    expect(script).toContain('__KEY__')
    expect(script).toContain('__K6_VERSION__')
  })
})
