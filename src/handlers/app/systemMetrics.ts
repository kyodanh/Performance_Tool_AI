import { setTimeout as delay } from 'node:timers/promises'
import { cpus, freemem, totalmem } from 'os'

import { SystemMetrics } from '@/types/systemMetrics'

interface CpuSample {
  idle: number
  total: number
}

function sampleCpu(): CpuSample {
  return cpus().reduce(
    (sample, { times }) => ({
      idle: sample.idle + times.idle,
      total:
        sample.total +
        times.user +
        times.nice +
        times.sys +
        times.idle +
        times.irq,
    }),
    { idle: 0, total: 0 }
  )
}

/** Busy share of all cores between two samples, as a whole percentage. */
export function busyPercent(first: CpuSample, second: CpuSample): number {
  const total = second.total - first.total
  const idle = second.idle - first.idle

  if (total <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round((1 - idle / total) * 100)))
}

/**
 * Sampled over a short window rather than against a stored previous sample: two
 * pollers — a second window, or a re-mounted panel — would otherwise split the
 * delta between them and both report a fraction of the real load.
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const first = sampleCpu()

  await delay(200)

  const total = totalmem()

  return {
    cpuPercent: busyPercent(first, sampleCpu()),
    cpuCount: cpus().length,
    // `freemem` reports only truly free pages, so page cache lands on the used
    // side here — expect a higher number than Activity Monitor's "memory used".
    memUsedBytes: total - freemem(),
    memTotalBytes: total,
  }
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest

  it('reports the busy share between two samples', () => {
    // 50 of 200 ticks idle — 75% busy.
    expect(
      busyPercent({ idle: 100, total: 200 }, { idle: 150, total: 400 })
    ).toBe(75)
  })

  it('reports nothing busy when no time passed between samples', () => {
    expect(
      busyPercent({ idle: 100, total: 200 }, { idle: 100, total: 200 })
    ).toBe(0)
  })
}
