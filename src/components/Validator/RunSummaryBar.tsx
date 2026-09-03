import { css } from '@emotion/react'
import { Flex, Text } from '@radix-ui/themes'
import { useMemo } from 'react'

import { Check } from '@/schemas/k6'
import { RunStats } from '@/utils/k6/stats'

import { checksFromStats } from './ChecksSection.utils'
import { formatCount } from './format'

interface Stat {
  label: string
  value: string
  unit?: string
  color?: string
}

interface RunSummaryBarProps {
  requestCount: number
  checks: Check[]
  stats: RunStats | null
}

/**
 * The run's headline numbers, as a strip of cards above the result panels —
 * the verdict is readable without opening the Checks tab.
 */
export function RunSummaryBar({
  requestCount,
  checks,
  stats,
}: RunSummaryBarProps) {
  const summary = useMemo(
    () => runSummaryStats(requestCount, checks, stats),
    [requestCount, checks, stats]
  )

  return (
    <Flex gap="2" px="4" py="3" flexShrink="0">
      {summary.map((stat) => (
        <Flex
          key={stat.label}
          direction="column"
          gap="2"
          flexGrow="1"
          flexBasis="0"
          minWidth="0"
          css={css`
            padding: var(--space-2) var(--space-3);
            border: 1px solid var(--gray-a4);
            border-radius: var(--radius-4);
            background-color: var(--gray-2);
          `}
        >
          <Text
            size="1"
            color="gray"
            css={css`
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.09em;
              text-transform: uppercase;
            `}
          >
            {stat.label}
          </Text>
          <Flex align="baseline" gap="1">
            <Text
              size="5"
              weight="bold"
              css={css`
                letter-spacing: -0.3px;
                color: ${stat.color ?? 'var(--gray-12)'};
              `}
            >
              {stat.value}
            </Text>
            {stat.unit !== undefined && (
              <Text size="1" color="gray">
                {stat.unit}
              </Text>
            )}
          </Flex>
        </Flex>
      ))}
    </Flex>
  )
}

/** Same check fallback as `ExecutionDetails` — see `checksFromStats`. */
export function resolveChecks(checks: Check[], stats: RunStats | null) {
  return checks.length > 0 ? checks : checksFromStats(stats)
}

export function checkTotals(checks: Check[]) {
  return checks.reduce(
    (totals, check) => ({
      passes: totals.passes + check.passes,
      fails: totals.fails + check.fails,
    }),
    { passes: 0, fails: 0 }
  )
}

export function runSummaryStats(
  requestCount: number,
  checks: Check[],
  stats: RunStats | null
): Stat[] {
  const { passes, fails } = checkTotals(resolveChecks(checks, stats))
  const total = passes + fails

  return [
    { label: 'Requests', value: formatCount(requestCount), unit: 'calls' },
    {
      label: 'Checks passed',
      value:
        total === 0 ? '—' : `${formatCount(passes)} / ${formatCount(total)}`,
      color: total > 0 && fails === 0 ? 'var(--green-11)' : undefined,
    },
    {
      label: 'Success rate',
      value: total === 0 ? '—' : ((passes / total) * 100).toFixed(0),
      unit: total === 0 ? undefined : '%',
      color: total > 0 && fails === 0 ? 'var(--green-11)' : undefined,
    },
    {
      label: 'Failed',
      value: formatCount(fails),
      color: fails > 0 ? 'var(--red-11)' : undefined,
    },
    {
      label: 'Avg duration',
      value: stats === null ? '—' : Math.round(stats.avgDuration).toString(),
      unit: stats === null ? undefined : 'ms',
    },
  ]
}
