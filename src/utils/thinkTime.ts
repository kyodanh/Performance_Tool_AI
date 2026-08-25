import { ProxyData } from '@/types'
import { FixedTiming, ThinkTime, Timing } from '@/types/testOptions'

export const createFixedTiming = (value = 1): FixedTiming => ({
  type: 'fixed',
  value,
})

export const createRangeTiming = (min = 1, max = 3): Timing => ({
  type: 'range',
  value: { min, max },
})

/**
 * Requests carry a fresh id on every recording load, so per-request overrides
 * (think time, rendezvous) are keyed by what stays the same. Identical requests
 * share one override.
 */
export function requestKey({ request }: Pick<ProxyData, 'request'>): string {
  return `${request.method} ${request.url}`
}

/**
 * The think time to wait after a single request: its own override when set,
 * otherwise the global one, and only when that is placed between requests.
 */
export function resolveThinkTime(
  thinkTime: ThinkTime,
  data: Pick<ProxyData, 'request'>
): Timing | null {
  return (
    thinkTime.overrides?.[requestKey(data)] ??
    (thinkTime.sleepType === 'requests' ? thinkTime.timing : null)
  )
}

/** Short label for the request row, e.g. `1s` or `1-3s`. */
export function formatTiming(timing: Timing): string {
  return timing.type === 'fixed'
    ? `${timing.value ?? 0}s`
    : `${timing.value.min}-${timing.value.max}s`
}
