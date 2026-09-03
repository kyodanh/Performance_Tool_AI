import { escapeHtml } from './format'

/** Inline-SVG charts for the printable report — no runtime, prints as vector. */

export interface ChartPoint {
  x: number
  y: number
}

export interface ChartSeries {
  label: string
  points: ChartPoint[]
}

export const SERIES_COLORS = [
  '#2c6fbb',
  '#c94f4f',
  '#3a9a5c',
  '#b6862c',
  '#7a52b3',
  '#2f9aa6',
  '#c25b9c',
  '#6b7280',
  '#8f5a2b',
  '#4a6fa5',
]

const WIDTH = 940
const HEIGHT = 300
const PAD = { top: 14, right: 18, bottom: 46, left: 68 }

/** Round an axis maximum up to something readable (1, 2, 2.5 or 5 × 10ⁿ). */
function niceMax(value: number) {
  if (value <= 0) {
    return 1
  }

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const scaled = value / magnitude

  const step = [1, 2, 2.5, 5, 10].find((candidate) => scaled <= candidate) ?? 10

  return step * magnitude
}

function axisLabel(value: number) {
  if (value >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

interface LineChartOptions {
  yLabel: string
  xLabel?: string
  /** Multiplies every y value before plotting, e.g. ms → s. */
  scale?: number
}

/**
 * A multi-series line chart. x values are unix seconds; they are drawn relative
 * to the first sample so the axis reads as elapsed run time.
 */
export function lineChart(
  series: ChartSeries[],
  { yLabel, xLabel = 'Elapsed time (s)', scale = 1 }: LineChartOptions
) {
  const points = series.flatMap((entry) => entry.points)

  if (points.length === 0) {
    return '<p class="empty">No samples were recorded for this graph.</p>'
  }

  const startX = Math.min(...points.map((point) => point.x))
  const endX = Math.max(...points.map((point) => point.x))
  const spanX = Math.max(1, endX - startX)
  const maxY = niceMax(Math.max(...points.map((point) => point.y * scale)))

  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom

  const toX = (value: number) =>
    PAD.left + ((value - startX) / spanX) * plotWidth
  const toY = (value: number) =>
    PAD.top + plotHeight - ((value * scale) / maxY) * plotHeight

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxY * ratio
    const y = PAD.top + plotHeight - ratio * plotHeight

    return `
      <line x1="${PAD.left}" y1="${y}" x2="${WIDTH - PAD.right}" y2="${y}" class="grid" />
      <text x="${PAD.left - 8}" y="${y + 4}" class="tick" text-anchor="end">${axisLabel(value)}</text>
    `
  })

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = Math.round(spanX * ratio)
    const x = PAD.left + ratio * plotWidth

    return `
      <text x="${x}" y="${HEIGHT - PAD.bottom + 18}" class="tick" text-anchor="middle">${value}</text>
    `
  })

  const paths = series.map((entry, index) => {
    const color = SERIES_COLORS[index % SERIES_COLORS.length]
    const path = entry.points
      .map(
        (point, position) =>
          `${position === 0 ? 'M' : 'L'} ${toX(point.x).toFixed(1)} ${toY(point.y).toFixed(1)}`
      )
      .join(' ')

    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" />`
  })

  const entries = series.map((entry, index) => ({
    label: entry.label,
    color: SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0],
  }))

  return `
    <svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">
      ${yTicks.join('')}
      ${xTicks.join('')}
      <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotHeight}" class="axis" />
      <line x1="${PAD.left}" y1="${PAD.top + plotHeight}" x2="${WIDTH - PAD.right}" y2="${PAD.top + plotHeight}" class="axis" />
      ${paths.join('')}
      <text x="14" y="${PAD.top + plotHeight / 2}" class="tick" transform="rotate(-90 14 ${PAD.top + plotHeight / 2})" text-anchor="middle">${escapeHtml(yLabel)}</text>
      <text x="${PAD.left + plotWidth / 2}" y="${HEIGHT - 8}" class="tick" text-anchor="middle">${escapeHtml(xLabel)}</text>
    </svg>
    ${legend(entries)}
  `
}

function legend(entries: Array<{ label: string; color?: string }>) {
  const items = entries.map(
    (entry) =>
      `<li><span class="swatch" style="background:${entry.color ?? SERIES_COLORS[0]}"></span>${escapeHtml(entry.label)}</li>`
  )

  return `<ul class="legend">${items.join('')}</ul>`
}

export interface Segment {
  label: string
  value: number
}

/**
 * A single horizontal bar split into its parts — the layers breakdown an
 * analysis report draws under the URL tables.
 */
export function stackedBar(segments: Segment[], unit: string) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)

  if (total <= 0) {
    return '<p class="empty">No timing samples were recorded.</p>'
  }

  const height = 92
  const barY = 18
  const barHeight = 26
  const plotWidth = WIDTH - PAD.left - PAD.right
  const maxValue = niceMax(total)

  let offset = 0

  const parts = segments.map((segment, index) => {
    const width = (segment.value / maxValue) * plotWidth
    const x = PAD.left + offset

    offset += width

    return `<rect x="${x.toFixed(1)}" y="${barY}" width="${width.toFixed(1)}" height="${barHeight}" fill="${SERIES_COLORS[index % SERIES_COLORS.length]}" />`
  })

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const x = PAD.left + ratio * plotWidth

    return `
      <line x1="${x}" y1="${barY}" x2="${x}" y2="${barY + barHeight + 4}" class="grid" />
      <text x="${x}" y="${barY + barHeight + 18}" class="tick" text-anchor="middle">${axisLabel(maxValue * ratio)}</text>
    `
  })

  return `
    <svg class="chart" viewBox="0 0 ${WIDTH} ${height}" role="img">
      ${ticks.join('')}
      ${parts.join('')}
      <text x="${PAD.left + plotWidth / 2}" y="${height - 6}" class="tick" text-anchor="middle">${escapeHtml(unit)}</text>
    </svg>
    ${legend(
      segments.map((segment, index) => ({
        label: segment.label,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      }))
    )}
  `
}

export interface Bar {
  label: string
  passed: number
  failed: number
}

/** Horizontal pass/fail bars — the report's Transaction Summary graph. */
export function barChart(bars: Bar[]) {
  if (bars.length === 0) {
    return '<p class="empty">No transactions were recorded.</p>'
  }

  // Transaction names are long, so the bars get their own paddings: room for a
  // full label on the left, and for the total printed past the bar on the right.
  const labelWidth = 220
  const valueWidth = 60
  const rowHeight = 22
  const height = PAD.top + bars.length * rowHeight + PAD.bottom
  const plotWidth = WIDTH - labelWidth - valueWidth
  const maxValue = niceMax(
    Math.max(...bars.map((bar) => bar.passed + bar.failed))
  )

  const rows = bars.map((bar, index) => {
    const y = PAD.top + index * rowHeight
    const passWidth = (bar.passed / maxValue) * plotWidth
    const failWidth = (bar.failed / maxValue) * plotWidth
    const label =
      bar.label.length > 34 ? `${bar.label.slice(0, 33)}…` : bar.label

    return `
      <text x="${labelWidth - 8}" y="${y + 15}" class="tick" text-anchor="end">${escapeHtml(label)}</text>
      <rect x="${labelWidth}" y="${y + 4}" width="${passWidth.toFixed(1)}" height="14" fill="${SERIES_COLORS[2]}" />
      <rect x="${(labelWidth + passWidth).toFixed(1)}" y="${y + 4}" width="${failWidth.toFixed(1)}" height="14" fill="${SERIES_COLORS[1]}" />
      <text x="${(labelWidth + passWidth + failWidth + 6).toFixed(1)}" y="${y + 15}" class="tick">${bar.passed + bar.failed}</text>
    `
  })

  return `
    <svg class="chart" viewBox="0 0 ${WIDTH} ${height}" role="img">
      ${rows.join('')}
      <line x1="${labelWidth}" y1="${PAD.top}" x2="${labelWidth}" y2="${PAD.top + bars.length * rowHeight}" class="axis" />
    </svg>
    ${legend([
      { label: 'Passed', color: SERIES_COLORS[2] },
      { label: 'Failed', color: SERIES_COLORS[1] },
    ])}
  `
}
