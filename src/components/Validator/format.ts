import { RunErrorGroup } from '@/utils/k6/stats'

export function formatCount(value: number) {
  return value.toLocaleString()
}

/** Seconds with 3 decimals, the way a controller reports response time. */
export function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(3)} s`
}

/**
 * A duration a run may not carry: percentiles are missing from results saved
 * before the distribution was collected, and `0.000 s` would read as "instant"
 * rather than "not recorded".
 */
export function formatOptionalTime(ms: number | undefined) {
  return ms === undefined ? '—' : formatTime(ms)
}

/** `Error %`, the way JMeter's aggregate report prints it. */
export function formatErrorRate(failed: number, total: number) {
  return `${total === 0 ? '0.00' : ((failed / total) * 100).toFixed(2)}%`
}

export function formatBytes(value: number) {
  const units = ['B', 'kB', 'MB', 'GB']

  let size = value
  let unit = 0

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }

  return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`
}

/** `hh:mm:ss`, matching how a controller reports elapsed run time. */
export function formatDuration(seconds: number) {
  return [seconds / 3600, (seconds % 3600) / 60, seconds % 60]
    .map((part) => String(Math.floor(part)).padStart(2, '0'))
    .join(':')
}

/** k6 encodes an unexpected HTTP status as `1000 + status`. */
function httpStatus(code: string) {
  const status = Number(code) - 1000

  return status >= 400 && status <= 599 ? status : null
}

/** The HTTP status when there is one, so the table shows 401 rather than 1401. */
export function describeCode(error: RunErrorGroup) {
  return String(httpStatus(error.code) ?? error.code ?? '') || '—'
}

/**
 * k6 leaves `error` empty when the request succeeded but the status was not the
 * expected one — the code is all it records, so name the class of failure.
 */
export function describeError(error: RunErrorGroup) {
  if (error.message !== '') {
    return error.message
  }

  const status = httpStatus(error.code)

  if (status === null) {
    return 'Unknown error'
  }

  return status < 500 ? '4xx client error' : '5xx server error'
}

/**
 * The class of failure, the way a controller groups its error report: the
 * codes k6 reports are otherwise opaque (1050, 1212) and a run's error list
 * says nothing about whether the target timed out, refused the connection or
 * answered 5xx. Ranges are k6's `error_codes.go`.
 */
export function describeCategory(error: RunErrorGroup) {
  const status = httpStatus(error.code)

  if (status !== null) {
    return status < 500 ? 'HTTP 4xx' : 'HTTP 5xx'
  }

  const code = Number(error.code)

  // 1211 is a dial timeout — the connection never came up, but it is still the
  // target being too slow rather than refusing.
  if (code === 1050 || code === 1211) {
    return 'Timeout'
  }

  if (code >= 1100 && code < 1200) {
    return 'DNS'
  }

  if (code >= 1200 && code < 1300) {
    return 'Connection'
  }

  if (code >= 1300 && code < 1400) {
    return 'TLS'
  }

  return 'Other'
}

/** Occurrences per category, largest first — the run's error rollup. */
export function errorCategories(errors: RunErrorGroup[]) {
  const totals = new Map<string, number>()

  for (const error of errors) {
    const category = describeCategory(error)

    totals.set(category, (totals.get(category) ?? 0) + error.count)
  }

  return [...totals]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}
