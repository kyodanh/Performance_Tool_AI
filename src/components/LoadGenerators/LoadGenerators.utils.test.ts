import { describe, expect, it } from 'vitest'

import { LoadGenerator } from '@/types/loadGenerator'

import { capacityWarning, generatorShare } from './LoadGenerators.utils'

function generator(overrides: Partial<LoadGenerator> = {}): LoadGenerator {
  return {
    id: 'a',
    instance: 'instance-01',
    hostname: 'lg-01',
    user: 'loadtest',
    ip: '10.0.0.7',
    os: 'linux',
    arch: 'amd64',
    k6Version: 'k6 v2.1.0',
    nofile: '65535',
    ports: '10000-65535',
    clock: 0,
    clockOffset: 0,
    weight: 1,
    status: 'ready',
    ...overrides,
  }
}

describe('generatorShare', () => {
  it('splits evenly with this machine taking part', () => {
    const one = generator({ id: 'a' })

    expect(generatorShare(one, [one], 100, true)).toBe(50)
  })

  it('gives a generator everything when this machine sits out', () => {
    const one = generator({ id: 'a' })

    expect(generatorShare(one, [one], 100, false)).toBe(100)
  })

  it('follows the weights', () => {
    const light = generator({ id: 'a', weight: 1 })
    const heavy = generator({ id: 'b', weight: 3 })

    expect(generatorShare(heavy, [light, heavy], 100, false)).toBe(75)
    expect(generatorShare(light, [light, heavy], 100, false)).toBe(25)
  })
})

describe('capacityWarning', () => {
  it('says nothing when the machine can carry its share', () => {
    expect(capacityWarning(generator(), 200)).toBeNull()
  })

  it('flags a port range smaller than the share', () => {
    expect(
      capacityWarning(generator({ ports: '49152-65535' }), 20_000)
    ).toMatch(/ephemeral ports/)
  })

  it('flags a file limit that cannot hold a socket per VU', () => {
    expect(capacityWarning(generator({ nofile: '1024' }), 800)).toMatch(
      /open file limit/
    )
  })

  it('treats unreadable limits as nothing to say', () => {
    expect(
      capacityWarning(generator({ ports: 'unknown', nofile: 'n/a' }), 5000)
    ).toBeNull()
    expect(capacityWarning(generator({ nofile: 'unlimited' }), 5000)).toBeNull()
  })

  it('says nothing before a profile has been chosen', () => {
    expect(capacityWarning(generator({ nofile: '1024' }), 0)).toBeNull()
  })
})
