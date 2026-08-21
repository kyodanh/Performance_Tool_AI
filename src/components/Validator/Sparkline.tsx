import { css } from '@emotion/react'
import { Flex, Text } from '@radix-ui/themes'

interface SparklineProps {
  label: string
  values: number[]
  value: string
  /** Elapsed-time labels for the x axis, as a controller chart shows them. */
  from?: string
  to?: string
  color?: string
  height?: number
}

/**
 * Minimal time-series chart. `preserveAspectRatio="none"` stretches the plot to
 * the container, and `vector-effect` keeps the stroke width from stretching
 * with it.
 */
export function Sparkline({
  label,
  values,
  value,
  from,
  to,
  color = 'var(--accent-9)',
  height = 56,
}: SparklineProps) {
  const max = Math.max(...values, 1)

  // A single sample has no line to draw, so duplicate it into a flat segment.
  const points = (values.length === 1 ? [...values, ...values] : values)
    .map((sample, index, all) => {
      const x = all.length > 1 ? (index / (all.length - 1)) * 100 : 0

      return `${x.toFixed(2)},${(100 - (sample / max) * 100).toFixed(2)}`
    })
    .join(' ')

  return (
    <Flex direction="column" gap="1" flexGrow="1" minWidth="120px">
      <Flex justify="between" align="baseline" gap="2">
        <Text size="1" color="gray">
          {label}
        </Text>
        <Text size="2" weight="medium">
          {value}
        </Text>
      </Flex>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${value}`}
        css={css`
          width: 100%;
          height: ${height}px;
          background-color: var(--gray-2);
          border: 1px solid var(--gray-4);
          border-radius: var(--radius-2);
        `}
      >
        {values.length > 0 && (
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {from !== undefined && to !== undefined && (
        <Flex justify="between" gap="2">
          <Text size="1" color="gray">
            {from}
          </Text>
          <Text size="1" color="gray">
            {to}
          </Text>
        </Flex>
      )}
    </Flex>
  )
}
