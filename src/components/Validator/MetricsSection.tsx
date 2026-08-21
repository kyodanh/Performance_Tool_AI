import { css } from '@emotion/react'
import {
  Box,
  Button,
  Callout,
  DataList,
  Dialog,
  Flex,
  Link,
  ScrollArea,
  Text,
} from '@radix-ui/themes'
import { InfoIcon } from 'lucide-react'
import { useState } from 'react'

import { RunStats, StatsBucket } from '@/utils/k6/stats'

import { ChecksTable } from './ChecksTable'
import { ErrorsTable } from './ErrorsTable'
import { formatBytes, formatCount, formatDuration, formatTime } from './format'
import { Sparkline } from './Sparkline'
import { TransactionChart } from './TransactionChart'
import { TransactionsTable } from './TransactionsTable'

/**
 * The newest bucket is the current, partial second — and each metric flushes on
 * its own beat — so a series' headline value is its last non-zero sample.
 */
function currentValue(values: number[]) {
  return values.findLast((value) => value > 0) ?? 0
}

/**
 * Requests per second over the trailing window — a controller's
 * "Hits/Second (last 60 sec)". Averaged over the buckets actually present, so a
 * run shorter than the window is not diluted by seconds that never happened.
 */
function hitsPerSecond(buckets: StatsBucket[], window = 60) {
  const newest = buckets.at(-1)?.time ?? 0
  const recent = buckets.filter((bucket) => bucket.time > newest - window)
  const hits = recent.reduce((sum, bucket) => sum + bucket.requests, 0)

  return hits / Math.max(1, recent.length)
}

const SERIES: Array<{
  label: string
  select: (bucket: StatsBucket) => number
  format: (value: number) => string
}> = [
  { label: 'Running VUs', select: (b) => b.vus, format: formatCount },
  { label: 'Requests/s', select: (b) => b.requests, format: formatCount },
  { label: 'Response time', select: (b) => b.duration, format: formatTime },
  {
    label: 'Throughput',
    select: (b) => b.throughput,
    format: (value) => `${formatBytes(value)}/s`,
  },
]

type Detail = 'transactions' | 'errors'

interface MetricsSectionProps {
  stats: RunStats | null
}

export function MetricsSection({ stats }: MetricsSectionProps) {
  const [detail, setDetail] = useState<Detail | null>(null)

  if (stats === null || stats.buckets.length === 0) {
    return (
      <Box p="2">
        <Callout.Root>
          <Callout.Icon>
            <InfoIcon />
          </Callout.Icon>
          <Callout.Text>
            Metrics for the current run will appear here.
          </Callout.Text>
        </Callout.Root>
      </Box>
    )
  }

  const failed = stats.groups.reduce((sum, group) => sum + group.failed, 0)
  const passed = stats.groups.reduce(
    (sum, group) => sum + Math.max(0, group.count - group.failed),
    0
  )
  const errorCount = stats.errors.reduce((sum, error) => sum + error.count, 0)
  // The charts plot the buckets, so their axis spans those, not stats.elapsed.
  const span = (stats.buckets.at(-1)?.time ?? 0) - (stats.buckets[0]?.time ?? 0)

  return (
    <ScrollArea scrollbars="vertical">
      <Flex direction="column" gap="3" p="3">
        <DataList.Root size="1" orientation="horizontal">
          <DataList.Item>
            <DataList.Label minWidth="88px">Running VUs</DataList.Label>
            <DataList.Value>
              {stats.vus} / {stats.vusMax}
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Elapsed time</DataList.Label>
            <DataList.Value>{formatDuration(stats.elapsed)}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Hits/second</DataList.Label>
            <DataList.Value>
              {hitsPerSecond(stats.buckets).toFixed(2)} (last 60 sec)
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Passed transactions</DataList.Label>
            <DataList.Value>
              <Counter
                value={passed}
                color="green"
                onClick={() => setDetail('transactions')}
              />
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Failed transactions</DataList.Label>
            <DataList.Value>
              <Counter
                value={failed}
                color={failed > 0 ? 'red' : 'gray'}
                onClick={() => setDetail('transactions')}
              />
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Errors</DataList.Label>
            <DataList.Value>
              <Counter
                value={errorCount}
                color={errorCount > 0 ? 'red' : 'gray'}
                onClick={() => setDetail('errors')}
              />
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Checks</DataList.Label>
            <DataList.Value>
              {formatCount(stats.checksPassed)} passed /{' '}
              <Text color={stats.checksFailed > 0 ? 'red' : undefined}>
                {formatCount(stats.checksFailed)} failed
              </Text>
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Requests</DataList.Label>
            <DataList.Value>
              {formatCount(stats.requests)} ({formatCount(stats.failedRequests)}{' '}
              failed)
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Iterations</DataList.Label>
            <DataList.Value>{formatCount(stats.iterations)}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Response time</DataList.Label>
            <DataList.Value>
              {formatTime(stats.avgDuration)} avg /{' '}
              {formatTime(stats.maxDuration)} max
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Data received</DataList.Label>
            <DataList.Value>{formatBytes(stats.dataReceived)}</DataList.Value>
          </DataList.Item>
        </DataList.Root>

        <Flex gap="3" wrap="wrap">
          {SERIES.map(({ label, select, format }) => {
            const values = stats.buckets.map(select)

            return (
              <Sparkline
                key={label}
                label={label}
                values={values}
                value={format(currentValue(values))}
                from={formatDuration(0)}
                to={formatDuration(span)}
              />
            )
          })}
        </Flex>

        {stats.groups.length > 0 && (
          <Section title="Transaction response time">
            <TransactionChart
              groups={stats.groups}
              start={stats.buckets[0]?.time ?? 0}
              end={stats.buckets.at(-1)?.time ?? 0}
            />
          </Section>
        )}

        {stats.groups.length > 0 && (
          <Section title="Transactions">
            <TransactionsTable
              groups={stats.groups}
              elapsed={stats.elapsed}
              errors={stats.errors}
              checks={stats.checks}
              requests={stats.requestStats}
            />
          </Section>
        )}

        {stats.checks.length > 0 && (
          <Section title="Checks">
            <ChecksTable checks={stats.checks} />
          </Section>
        )}

        {stats.errors.length > 0 && (
          <Section
            title={`Errors (total messages: ${formatCount(errorCount)})`}
          >
            <ErrorsTable errors={stats.errors} />
          </Section>
        )}
      </Flex>

      <Dialog.Root
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null)
          }
        }}
      >
        <Dialog.Content maxWidth="1100px" width="90vw">
          <Dialog.Title size="4">
            {detail === 'errors' ? 'Errors' : 'Transactions'}
          </Dialog.Title>
          <Box
            css={css`
              max-height: 60vh;
              overflow: auto;
            `}
          >
            {detail === 'errors' ? (
              <ErrorsTable errors={stats.errors} />
            ) : (
              <TransactionsTable
                groups={stats.groups}
                elapsed={stats.elapsed}
                errors={stats.errors}
                checks={stats.checks}
                requests={stats.requestStats}
              />
            )}
          </Box>
          <Flex justify="end" mt="3">
            <Dialog.Close>
              <Button variant="soft">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </ScrollArea>
  )
}

/** A status value that opens its own detail dialog, like a controller counter. */
function Counter({
  value,
  color,
  onClick,
}: {
  value: number
  color: 'green' | 'red' | 'gray'
  onClick: () => void
}) {
  return (
    <Link asChild color={color} underline="always">
      <button
        type="button"
        onClick={onClick}
        css={css`
          background: none;
          border: 0;
          padding: 0;
          font: inherit;
          cursor: pointer;
        `}
      >
        {formatCount(value)}
      </button>
    </Link>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Flex direction="column" gap="1">
      <span
        css={css`
          font-size: 13px;
          font-weight: 500;
        `}
      >
        {title}
      </span>
      {children}
    </Flex>
  )
}
