import { css } from '@emotion/react'
import { Flex, Text } from '@radix-ui/themes'

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

const WIDTH = 800
const HEIGHT = 220
const PAD = { top: 8, right: 8, bottom: 20, left: 46 }

/** The transactions the chart draws, in the order it assigns colours. */
export function chartedSeries(groups: GroupStats[]) {
  return groups
    .filter((group) => group.series.length > 0)
    .slice(0, MAX_SERIES)
    .map((group) => group.name)
}

interface TransactionChartProps {
  groups: GroupStats[]
  /** Unix timestamp the run's first sample landed on. */
  start: number
  /** Unix timestamp of the newest sample, the right edge of the x axis. */
  end: number
}

/** Response time per transaction over elapsed time, one line per `group()`. */
export function TransactionChart({
  groups,
  start,
  end,
}: TransactionChartProps) {
  const series = groups.filter((group) => group.series.length > 0)

  if (series.length === 0) {
    return null
  }

  const span = Math.max(1, end - start)
  const max = Math.max(
    ...series.flatMap((group) => group.series.map((sample) => sample.value)),
    1
  )

  const x = (time: number) =>
    PAD.left + ((time - start) / span) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) =>
    PAD.top + (1 - value / max) * (HEIGHT - PAD.top - PAD.bottom)

  const ticks = [0, 0.5, 1]

  return (
    <Flex direction="column" gap="1">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Response time per transaction over elapsed time"
        css={css`
          width: 100%;
          height: auto;
          background-color: var(--gray-2);
          border: 1px solid var(--gray-4);
          border-radius: var(--radius-2);
        `}
      >
        {ticks.map((tick) => (
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
              {((max * tick) / 1000).toFixed(1)}
            </text>
          </g>
        ))}

        {series.slice(0, MAX_SERIES).map((group, index) => (
          <polyline
            key={group.name}
            points={group.series
              .map(
                (sample) =>
                  `${x(sample.time).toFixed(1)},${y(sample.value).toFixed(1)}`
              )
              .join(' ')}
            fill="none"
            stroke={SERIES_COLORS[index]}
            strokeDasharray={SERIES_DASHES[index]}
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <title>{group.name}</title>
          </polyline>
        ))}

        <text x={PAD.left} y={HEIGHT - 6} fontSize="10" fill="var(--gray-11)">
          {formatDuration(0)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 6}
          textAnchor="end"
          fontSize="10"
          fill="var(--gray-11)"
        >
          {formatDuration(span)}
        </text>
      </svg>
      <Text size="1" color="gray">
        Response time (sec) over elapsed time
        {series.length > MAX_SERIES &&
          ` — first ${MAX_SERIES} transactions, the rest are in the table`}
      </Text>
    </Flex>
  )
}
