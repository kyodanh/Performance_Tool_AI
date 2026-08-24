import { css } from '@emotion/react'
import { Button, Card, Dialog, Flex, Text } from '@radix-ui/themes'
import { useState } from 'react'

import { GroupStats } from '@/utils/k6/stats'

import { formatDuration } from './format'

/**
 * Series are told apart by colour *and* dash pattern: the palette is validated
 * for normal vision but the green/red pair sits in the CVD floor band, so the
 * stroke carries a second, colour-independent cue.
 */
export const SERIES_COLORS = [
  'var(--blue-9)',
  'var(--tomato-9)',
  'var(--pink-9)',
  'var(--grass-9)',
]

export const SERIES_DASHES = ['', '10 6', '2 5', '14 5 2 5']

// ponytail: a 5th line has no colour left that stays legible for CVD readers —
// the rest of the transactions keep their numbers in the table below.
export const MAX_SERIES = SERIES_COLORS.length

/** The transactions the chart draws, in the order it assigns colours. */
export function chartedSeries(groups: GroupStats[]) {
  return groups
    .filter((group) => group.series.length > 0)
    .slice(0, MAX_SERIES)
    .map((group) => group.name)
}

/** Colour and dash pattern for the nth line in a panel. */
export function seriesStyle(index: number) {
  return {
    color: SERIES_COLORS[index % SERIES_COLORS.length] ?? 'var(--blue-9)',
    dash: SERIES_DASHES[index % SERIES_DASHES.length],
  }
}

export interface PanelSeries {
  name: string
  color: string
  dash?: string
  samples: Array<{ time: number; value: number }>
}

const WIDTH = 800
const PAD = { top: 8, right: 8, bottom: 18, left: 52 }

interface ChartProps {
  series: PanelSeries[]
  /** Unix timestamp of the run's first sample, the left edge of the x axis. */
  start: number
  end: number
  format: (value: number) => string
  height: number
}

/** One plot, shared by the panel and its detail dialog. */
function Chart({ series, start, end, format, height }: ChartProps) {
  const span = Math.max(1, end - start)
  const max = Math.max(
    ...series.flatMap((line) => line.samples.map((sample) => sample.value)),
    1
  )

  const x = (time: number) =>
    PAD.left + ((time - start) / span) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) =>
    PAD.top + (1 - value / max) * (height - PAD.top - PAD.bottom)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={series.map((line) => line.name).join(', ')}
      css={css`
        width: 100%;
        height: ${height}px;
        background-color: var(--gray-2);
        border: 1px solid var(--gray-4);
        border-radius: var(--radius-3);
      `}
    >
      {[0, 0.5, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(max * tick)}
            y2={y(max * tick)}
            stroke="var(--gray-5)"
            strokeWidth="1"
          />
          <text
            x={PAD.left - 6}
            y={y(max * tick) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--gray-11)"
          >
            {format(max * tick)}
          </text>
        </g>
      ))}

      {series.map((line) => (
        <polyline
          key={line.name}
          points={line.samples
            .map(
              (sample) =>
                `${x(sample.time).toFixed(1)},${y(sample.value).toFixed(1)}`
            )
            .join(' ')}
          fill="none"
          stroke={line.color}
          strokeDasharray={line.dash}
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        >
          <title>{line.name}</title>
        </polyline>
      ))}

      <text x={PAD.left} y={height - 4} fontSize="10" fill="var(--gray-11)">
        {formatDuration(0)}
      </text>
      <text
        x={WIDTH - PAD.right}
        y={height - 4}
        textAnchor="end"
        fontSize="10"
        fill="var(--gray-11)"
      >
        {formatDuration(span)}
      </text>
    </svg>
  )
}

function Legend({ series }: { series: PanelSeries[] }) {
  return (
    <Flex gap="3" wrap="wrap">
      {series.map((line) => (
        <Flex key={line.name} gap="2" align="center">
          <span
            css={css`
              width: 12px;
              height: 3px;
              border-radius: var(--radius-1);
              background-color: ${line.color};
            `}
          />
          <Text size="1" color="gray">
            {line.name}
          </Text>
        </Flex>
      ))}
    </Flex>
  )
}

interface MetricPanelProps {
  title: string
  /** What the y axis counts, e.g. `sec` or `# of VUsers`. */
  unit: string
  series: PanelSeries[]
  start: number
  end: number
  format: (value: number) => string
}

/**
 * A chart over the whole run, as a controller shows it: one card per metric,
 * click for a larger plot and the min/avg/max of every series.
 */
export function MetricPanel({
  title,
  unit,
  series,
  start,
  end,
  format,
}: MetricPanelProps) {
  const [open, setOpen] = useState(false)

  const drawn = series.filter((line) => line.samples.length > 0)

  if (drawn.length === 0) {
    return null
  }

  return (
    <>
      <Card
        asChild
        css={css`
          cursor: pointer;

          &:hover {
            outline: 1px solid var(--accent-8);
          }
        `}
      >
        <button type="button" onClick={() => setOpen(true)}>
          <Flex direction="column" gap="2" align="stretch">
            <Flex justify="between" align="baseline" gap="2">
              <Text size="2" weight="medium">
                {title}
              </Text>
              <Text size="1" color="gray">
                {unit}
              </Text>
            </Flex>
            <Chart
              series={drawn}
              start={start}
              end={end}
              format={format}
              height={150}
            />
            <Legend series={drawn} />
          </Flex>
        </button>
      </Card>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content maxWidth="1000px" width="90vw">
          <Dialog.Title size="4" mb="1">
            {title}
          </Dialog.Title>
          <Dialog.Description size="1" color="gray" mb="3">
            {unit} · whole load test
          </Dialog.Description>
          <Chart
            series={drawn}
            start={start}
            end={end}
            format={format}
            height={300}
          />
          <SeriesTable series={drawn} format={format} />
          <Flex justify="end" mt="3">
            <Dialog.Close>
              <Button variant="soft">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}

function SeriesTable({
  series,
  format,
}: {
  series: PanelSeries[]
  format: (value: number) => string
}) {
  return (
    <table
      css={css`
        width: 100%;
        margin-top: var(--space-3);
        border-collapse: collapse;
        font-size: var(--font-size-2);

        th,
        td {
          padding: var(--space-2);
          text-align: right;
          border-bottom: 1px solid var(--gray-4);
        }

        th:first-of-type,
        td:first-of-type {
          text-align: left;
        }

        th {
          font-size: var(--font-size-1);
          font-weight: 500;
          color: var(--gray-11);
        }
      `}
    >
      <thead>
        <tr>
          <th>Series</th>
          <th>Min</th>
          <th>Avg</th>
          <th>Max</th>
        </tr>
      </thead>
      <tbody>
        {series.map((line) => {
          const values = line.samples.map((sample) => sample.value)
          const sum = values.reduce((total, value) => total + value, 0)

          return (
            <tr key={line.name}>
              <td>
                <Flex gap="2" align="center">
                  <span
                    css={css`
                      width: 12px;
                      height: 3px;
                      border-radius: var(--radius-1);
                      background-color: ${line.color};
                    `}
                  />
                  {line.name}
                </Flex>
              </td>
              <td>{format(Math.min(...values))}</td>
              <td>{format(sum / values.length)}</td>
              <td>{format(Math.max(...values))}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
