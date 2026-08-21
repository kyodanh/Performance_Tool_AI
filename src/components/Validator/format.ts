import { RunErrorGroup } from '@/utils/k6/stats'

export function formatCount(value: number) {
  return value.toLocaleString()
}

/** Seconds with 3 decimals, the way a controller reports response time. */
export function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(3)} s`
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
