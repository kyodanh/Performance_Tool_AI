import { css } from '@emotion/react'
import { Card, Flex, Text } from '@radix-ui/themes'

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
 * Headline value for one metric over its own trend line — the KPI card row a
 * controller opens with. `preserveAspectRatio="none"` stretches the plot to the
 * container, and `vector-effect` keeps the stroke width from stretching with it.
 */
export function Sparkline({
  label,
  values,
  value,
  from,
  to,
  color = 'var(--accent-9)',
  height = 44,
}: SparklineProps) {
  const max = Math.max(...values, 1)

  // A single sample has no line to draw, so duplicate it into a flat segment.
  const points = (values.length === 1 ? [...values, ...values] : values).map(
    (sample, index, all) => {
      const x = all.length > 1 ? (index / (all.length - 1)) * 100 : 0

      return `${x.toFixed(2)},${(100 - (sample / max) * 100).toFixed(2)}`
    }
  )

  return (
    <Card size="2">
      <Flex direction="column" gap="2">
        <Text size="1" color="gray">
          {label}
        </Text>
        <Text size="6" weight="bold">
          {value}
        </Text>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label}: ${value}`}
          css={css`
            width: 100%;
            height: ${height}px;
            display: block;
          `}
        >
          {values.length > 0 && (
            <>
              <polygon
                points={`0,100 ${points.join(' ')} 100,100`}
                fill={color}
                opacity="0.14"
              />
              <polyline
                points={points.join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </>
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
    </Card>
  )
}
