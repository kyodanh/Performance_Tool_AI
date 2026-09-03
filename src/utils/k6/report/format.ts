/** Formatting helpers shared by the printable performance report. */

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Milliseconds as seconds with 3 decimals, the way a controller reports it. */
export function seconds(ms: number) {
  return (ms / 1000).toFixed(3)
}

export function count(value: number) {
  return value.toLocaleString('en-US')
}

export function decimal(value: number, digits = 1) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function bytes(value: number) {
  const units = ['B', 'kB', 'MB', 'GB']

  let size = value
  let unit = 0

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }

  return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`
}

/** `dd/MM/yyyy HH:mm:ss`, matching the report headers. */
export function timestamp(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')

  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export function day(unixSeconds: number) {
  return timestamp(unixSeconds).slice(0, 10)
}

/** Human run length, e.g. `5 minutes and 27 seconds`. */
export function duration(totalSeconds: number) {
  const value = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(value / 60)
  const rest = value % 60
  const parts = []

  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  }

  parts.push(`${rest} second${rest === 1 ? '' : 's'}`)

  return parts.join(' and ')
}

/**
 * Nearest-rank percentile, the way an analysis report prints its `90%` column.
 * Returns 0 for an empty series.
 */
export function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil(ratio * sorted.length) - 1

  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] ?? 0
}

export interface SeriesSummary {
  min: number
  avg: number
  max: number
  median: number
  std: number
}

/** The min / average / max / median / std. block every graph page carries. */
export function summarize(values: number[]): SeriesSummary {
  if (values.length === 0) {
    return { min: 0, avg: 0, max: 0, median: 0, std: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
  const middle = Math.floor(sorted.length / 2)

  return {
    min: sorted[0] ?? 0,
    avg,
    max: sorted[sorted.length - 1] ?? 0,
    median:
      sorted.length % 2 === 0
        ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
        : (sorted[middle] ?? 0),
    std: Math.sqrt(variance),
  }
}
