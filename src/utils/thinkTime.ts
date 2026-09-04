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
 * otherwise the global one.
 *
 * Only ever returns something in `requests` mode. A sleep between requests is
 * emitted inside the `group()` the request belongs to, so in `groups` or
 * `iterations` mode it would land in the middle of a transaction and k6 would
 * count it into `group_duration` — the transaction would report the wait as
 * response time, which is not what a controller reports and not what the user
 * asked for by placing think time outside the group.
 */
export function resolveThinkTime(
  thinkTime: ThinkTime,
  data: Pick<ProxyData, 'request'>
): Timing | null {
  if (thinkTime.sleepType !== 'requests') {
    return null
  }

  return thinkTime.overrides?.[requestKey(data)] ?? thinkTime.timing
}

/** Short label for the request row, e.g. `1s` or `1-3s`. */
export function formatTiming(timing: Timing): string {
  return timing.type === 'fixed'
    ? `${timing.value ?? 0}s`
    : `${timing.value.min}-${timing.value.max}s`
}

/**
 * Key used to remove a single recorded request. A recording usually repeats
 * identical requests, so `requestKey` alone would remove every twin along with
 * the row the user clicked. The occurrence index is stable across recording
 * reloads, unlike the request id.
 */
export function exclusionKeys(
  requests: Pick<ProxyData, 'request'>[]
): string[] {
  const seen = new Map<string, number>()

  return requests.map((request) => {
    const key = requestKey(request)
    const occurrence = seen.get(key) ?? 0

    seen.set(key, occurrence + 1)

    return `${key}#${occurrence}`
  })
}

/** The `exclusionKeys` entry for one recorded request, by id. */
export function exclusionKeyById(
  requests: ProxyData[],
  id: string
): string | null {
  const index = requests.findIndex((request) => request.id === id)

  if (index === -1) {
    return null
  }

  const key = requestKey(requests[index]!)
  const occurrence = requests
    .slice(0, index)
    .filter((request) => requestKey(request) === key).length

  return `${key}#${occurrence}`
}
