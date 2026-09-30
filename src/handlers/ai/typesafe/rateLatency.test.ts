import { afterEach, describe, expect, it, vi } from 'vitest'

import { RequestStats } from '@/utils/k6/stats'

import { rateLatency } from './rateLatency'

const stats = (name: string, max: number): RequestStats =>
  ({
    method: 'GET',
    name: `https://api.test/${name}?q=1`,
    status: '200',
    group: '',
    count: 3,
    failed: 0,
    avg: max / 2,
    max,
    min: 10,
    total: max * 3,
    serverTime: max * 2.7,
  }) as RequestStats

describe('rateLatency', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rates the slowest requests first, by where they lose time', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          answers: {
            cause_0: {
              type: 'choice',
              choice: 'server_processing',
              confidence: 0.9,
              probabilities: { server_processing: 0.8, server_contention: 0.2 },
            },
          },
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const triage = await rateLatency(
      { requestStats: [stats('fast', 200), stats('Search', 30_000)] },
      'key'
    )

    expect(triage.kind).toBe('latency')
    expect(triage.rows[0]).toMatchObject({
      endpoint: 'Search',
      code: '',
      causes: [
        {
          cause: 'server_processing',
          label: 'Xử lý server (query/export)',
          share: 0.8,
        },
        {
          cause: 'server_contention',
          label: 'Tranh chấp tài nguyên server',
          share: 0.2,
        },
      ],
      meaning: 'GET · HTTP 200 · server 90% thời gian',
      confidence: 0.9,
    })
    // `fast` went unanswered, so the run is only as sure as that: 0.
    expect(triage.confidence).toBe(0)
  })

  it('skips the call without a key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(
      (await rateLatency({ requestStats: [stats('a', 1)] }, null)).rows
    ).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
