import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { LogEntry } from '@/schemas/k6'
import { createK6Log } from '@/test/factories/k6Log'
import { RunStats } from '@/utils/k6/stats'

import { useLoadRunStore } from './loadRun'

type Handler<T> = (data: T) => void

const handlers = {
  stats: [] as Handler<RunStats>[],
  log: [] as Handler<LogEntry>[],
  stopped: [] as Handler<void>[],
}

const stats = { buckets: [{ time: 0 }] } as unknown as RunStats

describe('loadRun store', () => {
  beforeAll(() => {
    vi.stubGlobal('studio', {
      script: {
        onScriptStats: (cb: Handler<RunStats>) => handlers.stats.push(cb),
        onScriptCheck: () => {},
        onScriptLog: (cb: Handler<LogEntry>) => handlers.log.push(cb),
        onScriptStopped: (cb: Handler<void>) => handlers.stopped.push(cb),
      },
    })
  })

  beforeEach(() => {
    useLoadRunStore.setState({
      isRunning: false,
      isStopping: false,
      stats: null,
      resources: [],
      logs: [],
      checks: [],
      errors: [],
    })
  })

  it('collects the run and keeps it after the run stops', () => {
    useLoadRunStore.getState().startRun()

    handlers.stats.forEach((cb) => cb(stats))
    handlers.stopped.forEach((cb) => cb())

    expect(useLoadRunStore.getState().isRunning).toBe(false)
    // The panel can unmount and come back to the finished run's metrics.
    expect(useLoadRunStore.getState().stats).toBe(stats)
  })

  it("keeps each machine's worst CPU and memory of the run", () => {
    const sample = (id: string, cpuPercent: number, memUsedBytes: number) => ({
      id,
      name: id,
      cpuPercent,
      cpuCount: 8,
      memUsedBytes,
      memTotalBytes: 8_000,
    })

    useLoadRunStore.getState().sampleResources([sample('local', 90, 6_000)])
    useLoadRunStore
      .getState()
      .sampleResources([sample('local', 20, 1_000), sample('lg-01', 30, 2_000)])

    const [local, remote] = useLoadRunStore.getState().resources

    expect(local).toMatchObject({
      cpuPercent: 20,
      peakCpuPercent: 90,
      peakMemUsedBytes: 6_000,
    })
    // A machine that joins the table late peaks from its own first sample.
    expect(remote).toMatchObject({ peakCpuPercent: 30 })
  })

  it('ignores events outside a run', () => {
    handlers.stats.forEach((cb) => cb(stats))

    expect(useLoadRunStore.getState().stats).toBeNull()
  })

  it('reports error logs, except after a deliberate stop', () => {
    useLoadRunStore.getState().startRun()

    handlers.log.forEach((cb) =>
      cb(createK6Log({ level: 'error', error: 'boom' }))
    )

    expect(useLoadRunStore.getState().errors).toEqual(['boom'])

    useLoadRunStore.getState().stopRun()
    useLoadRunStore.setState({ isRunning: true })

    handlers.log.forEach((cb) =>
      cb(createK6Log({ level: 'error', error: 'terminated' }))
    )

    expect(useLoadRunStore.getState().errors).toEqual(['boom'])
  })
})
