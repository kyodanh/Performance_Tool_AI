import {
  Badge,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
} from '@radix-ui/themes'
import { TriangleAlertIcon } from 'lucide-react'

import { formatCount, formatDuration } from '@/components/Validator/format'
import { SeriesSwatch } from '@/components/Validator/MetricPanel'
import { SlaBadge } from '@/components/Validator/SlaSection'
import { evaluateSla, Sla, SlaVerdict } from '@/utils/k6/sla'
import { RunStats } from '@/utils/k6/stats'

import { ChangeBadge, formatValue } from './CompareChangeBadge'
import { BASE_STYLE, CompareCharts, NOW_STYLE } from './CompareCharts'
import { CompareMetricsTable } from './CompareMetricsTable'
import {
  compareRuns,
  compareTransactions,
  loadMismatch,
  slaRegressions,
} from './compareRuns'
import { CompareTransactionsTable } from './CompareTransactionsTable'

interface CompareRunsTableProps {
  base: RunStats
  current: RunStats
  baseLabel: string
  currentLabel: string
  sla: Sla
}

/** The headline tiles — the numbers a regression shows up in first. */
const KPIS = ['Error rate', 'Avg', '95%', 'Requests/s']

const KPI_TITLES: Record<string, string> = {
  Avg: 'Avg response time',
  '95%': '95th percentile',
}

function RunLine({
  role,
  label,
  stats,
  style,
  verdict,
}: {
  role: string
  label: string
  stats: RunStats
  style: { color: string; dash?: string }
  verdict: SlaVerdict | null
}) {
  return (
    <Flex gap="2" align="center" wrap="wrap">
      <SeriesSwatch {...style} />
      <Text size="2" weight="medium">
        {role}
      </Text>
      <Text size="2">{label}</Text>
      <Text size="1" color="gray">
        {formatDuration(stats.elapsed)} · {formatCount(stats.vusMax)} VUs ·{' '}
        {formatCount(stats.requests)} requests
      </Text>
      <SlaBadge verdict={verdict} />
    </Flex>
  )
}

/**
 * Two saved runs side by side — which run is which, the headline numbers, both
 * runs drawn over each other, then every metric with its change.
 */
export function CompareRunsTable({
  base,
  current,
  baseLabel,
  currentLabel,
  sla,
}: CompareRunsTableProps) {
  const sections = compareRuns(base, current)
  const rows = sections.flatMap((section) => section.rows)
  const transactions = compareTransactions(base, current)
  const mismatch = loadMismatch(base, current)
  const worse = rows.filter((row) => row.verdict === 'worse').length
  const better = rows.filter((row) => row.verdict === 'better').length
  const baseVerdict = evaluateSla(base, sla)
  const currentVerdict = evaluateSla(current, sla)
  const regressions = slaRegressions(baseVerdict, currentVerdict)

  return (
    <Flex direction="column" gap="4">
      <Card>
        <Flex direction="column" gap="2">
          <RunLine
            role="Now"
            label={currentLabel}
            stats={current}
            style={NOW_STYLE}
            verdict={currentVerdict}
          />
          <RunLine
            role="Base"
            label={baseLabel}
            stats={base}
            style={BASE_STYLE}
            verdict={baseVerdict}
          />
        </Flex>
      </Card>

      {regressions.length > 0 && (
        <Callout.Root color="red" size="1">
          <Callout.Icon>
            <TriangleAlertIcon />
          </Callout.Icon>
          <Callout.Text>
            Now over the SLA where Base was within it:{' '}
            {regressions.map((row) => row.name).join(', ')}
          </Callout.Text>
        </Callout.Root>
      )}

      {mismatch.length > 0 && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon>
            <TriangleAlertIcon />
          </Callout.Icon>
          <Callout.Text>
            These runs had a different load shape — {mismatch.join(', ')} — so
            the differences below may come from the test, not the target.
          </Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="between" align="baseline" gap="3" wrap="wrap">
        <Heading size="3">Overview</Heading>
        <Flex gap="2">
          <Badge color="red" variant="soft">
            {worse} worse
          </Badge>
          <Badge color="green" variant="soft">
            {better} better
          </Badge>
          <Text size="1" color="gray">
            changes under 5% count as the same
          </Text>
        </Flex>
      </Flex>
      <Grid columns="repeat(auto-fit, minmax(190px, 1fr))" gap="3">
        {KPIS.map((label) => {
          const row = rows.find((candidate) => candidate.label === label)

          if (row === undefined) {
            return null
          }

          return (
            <Card key={label}>
              <Flex direction="column" gap="1">
                <Flex justify="between" align="center" gap="2">
                  <Text size="2" color="gray">
                    {KPI_TITLES[label] ?? label}
                  </Text>
                  <ChangeBadge row={row} />
                </Flex>
                <Text size="6" weight="bold">
                  {formatValue(row.current, row.format)}
                </Text>
                <Text size="1" color="gray">
                  Base {formatValue(row.base, row.format)}
                </Text>
              </Flex>
            </Card>
          )
        })}
      </Grid>

      <Heading size="3">Over time</Heading>
      <CompareCharts base={base} current={current} />

      <Heading size="3">All metrics</Heading>
      <CompareMetricsTable sections={sections} />

      {transactions.length > 0 && (
        <>
          <Heading size="3">Transactions</Heading>
          <CompareTransactionsTable
            transactions={transactions}
            verdict={currentVerdict}
          />
        </>
      )}
    </Flex>
  )
}
