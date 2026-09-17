import { Badge } from '@radix-ui/themes'

import {
  formatBytes,
  formatCount,
  formatDuration,
  formatTime,
} from '@/components/Validator/format'

import { CompareFormat, CompareRow } from './compareRuns'

export function formatValue(value: number | undefined, format: CompareFormat) {
  if (value === undefined) {
    return '—'
  }

  switch (format) {
    case 'time':
      return formatTime(value)
    case 'duration':
      return formatDuration(value)
    case 'percent':
      return `${value.toFixed(2)}%`
    case 'rate':
      return value.toFixed(2)
    case 'bytes':
      return formatBytes(value)
    default:
      return formatCount(value)
  }
}

/** The change as a badge: arrow for direction, colour for good or bad. */
export function ChangeBadge({ row }: { row: CompareRow }) {
  const color =
    row.verdict === 'better'
      ? 'green'
      : row.verdict === 'worse'
        ? 'red'
        : 'gray'

  if (row.change === null) {
    // Moved off zero, or one side missing — no percent to show.
    return (
      <Badge color={color} variant="soft">
        {row.verdict === null || row.verdict === 'same' ? '—' : 'new'}
      </Badge>
    )
  }

  const arrow = row.verdict === 'same' ? '≈' : row.change > 0 ? '▲' : '▼'

  return (
    <Badge color={color} variant="soft">
      {arrow} {Math.abs(row.change).toFixed(1)}%
    </Badge>
  )
}
