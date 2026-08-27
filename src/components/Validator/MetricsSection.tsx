import { css } from '@emotion/react'
import {
  Box,
  Button,
  Callout,
  Card,
  DataList,
  Dialog,
  Flex,
  Grid,
  Heading,
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
import {
  MAX_SERIES,
  MetricPanel,
  PanelSeries,
  seriesStyle,
} from './MetricPanel'
import { Sparkline } from './Sparkline'
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
  format: (value: number, stats: RunStats) => string
}> = [
  {
    label: 'Running VUs',
    select: (b) => b.vus,
    // The last gauge tick of a finished run catches VUs shutting down, so the
    // headline alone reads lower than the run ever was — pair it with the peak.
    format: (value, stats) =>
      `${formatCount(value)} / ${formatCount(stats.vusMax)}`,
  },
  { label: 'Requests/s', select: (b) => b.requests, format: formatCount },
  { label: 'Response time', select: (b) => b.duration, format: formatTime },
  {
    label: 'Throughput',
    select: (b) => b.throughput,
    format: (value) => `${formatBytes(value)}/s`,
  },
]

/** Counts on an axis: whole numbers, but a midpoint of 0.5 stays visible. */
function formatAxisCount(value: number) {
  return value.toFixed(Number.isInteger(value) ? 0 : 1)
}

const PHASES: Array<{ label: string; key: keyof RunStats['timings'] }> = [
  { label: 'Blocked', key: 'blocked' },
  { label: 'Connecting', key: 'connecting' },
  { label: 'TLS handshake', key: 'tlsHandshaking' },
  { label: 'Sending', key: 'sending' },
  { label: 'Waiting (TTFB)', key: 'waiting' },
  { label: 'Receiving', key: 'receiving' },
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
  const start = stats.buckets[0]?.time ?? 0
  const end = stats.buckets.at(-1)?.time ?? 0
  const span = end - start

  const samples = (select: (bucket: StatsBucket) => number) =>
    stats.buckets.map((bucket) => ({
      time: bucket.time,
      value: select(bucket),
    }))

  const line = (
    name: string,
    index: number,
    select: (bucket: StatsBucket) => number
  ): PanelSeries => ({
    name,
    ...seriesStyle(index),
    samples: samples(select),
  })

  const transactions: PanelSeries[] = stats.groups
    .filter((group) => group.series.length > 0)
    .slice(0, MAX_SERIES)
    .map((group, index) => ({
      name: group.name,
      ...seriesStyle(index),
      samples: group.series.map((sample) => ({
        time: sample.time,
        value: sample.value,
      })),
    }))

  const maxPhase = Math.max(
    ...PHASES.map((phase) => stats.timings[phase.key]),
    1
  )

  return (
    <ScrollArea scrollbars="vertical">
      <Flex direction="column" gap="4" p="3">
        <Grid
          columns="repeat(auto-fit, minmax(190px, 1fr))"
          gap="3"
          align="start"
        >
          {SERIES.map(({ label, select, format }) => {
            const values = stats.buckets.map(select)

            return (
              <Sparkline
                key={label}
                label={label}
                values={values}
                value={format(currentValue(values), stats)}
                from={formatDuration(0)}
                to={formatDuration(span)}
              />
            )
          })}
        </Grid>

        <Grid
          columns="repeat(auto-fit, minmax(320px, 1fr))"
          gap="3"
          align="start"
        >
          <Card size="2">
            <Flex direction="column" gap="2">
              <SectionTitle>Summary</SectionTitle>
              <DataList.Root size="1" orientation="horizontal">
                <DataList.Item>
                  <DataList.Label minWidth="88px">Running VUs</DataList.Label>
                  <DataList.Value>
                    {stats.vus} / {stats.vusMax}
                  </DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">Elapsed time</DataList.Label>
                  <DataList.Value>
                    {formatDuration(stats.elapsed)}
                  </DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">Hits/second</DataList.Label>
                  <DataList.Value>
                    {hitsPerSecond(stats.buckets).toFixed(2)} (last 60 sec)
                  </DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">
                    Passed transactions
                  </DataList.Label>
                  <DataList.Value>
                    <Counter
                      value={passed}
                      color="green"
                      onClick={() => setDetail('transactions')}
                    />
                  </DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">
                    Failed transactions
                  </DataList.Label>
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
                    {formatCount(stats.requests)} (
                    {formatCount(stats.failedRequests)} failed)
                  </DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">Iterations</DataList.Label>
                  <DataList.Value>
                    {formatCount(stats.iterations)}
                    {stats.droppedIterations > 0 && (
                      <Text color="red">
                        {' '}
                        ({formatCount(stats.droppedIterations)} dropped)
                      </Text>
                    )}
                  </DataList.Value>
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
                  <DataList.Value>
                    {formatBytes(stats.dataReceived)}
                  </DataList.Value>
                </DataList.Item>
              </DataList.Root>
            </Flex>
          </Card>

          <Card size="2">
            <Flex direction="column" gap="2">
              <SectionTitle>Response time breakdown</SectionTitle>
              <Flex direction="column">
                {PHASES.map(({ label, key }) => (
                  <Grid
                    key={key}
                    columns="minmax(80px, 110px) 1fr 64px"
                    gap="3"
                    align="center"
                    py="1"
                  >
                    <Text size="1" color="gray">
                      {label}
                    </Text>
                    <Box
                      css={css`
                        height: 6px;
                        border-radius: var(--radius-1);
                        background-color: var(--gray-4);
                        overflow: hidden;
                      `}
                    >
                      <Box
                        css={css`
                          height: 100%;
                          width: ${(
                            (stats.timings[key] / maxPhase) *
                            100
                          ).toFixed(1)}%;
                          background-color: ${key === 'waiting'
                            ? 'var(--accent-9)'
                            : 'var(--accent-7)'};
                        `}
                      />
                    </Box>
                    <Text size="1" weight="medium" align="right">
                      {formatTime(stats.timings[key])}
                    </Text>
                  </Grid>
                ))}
              </Flex>
              <Text size="1" color="gray">
                Blocked/connecting/TLS/sending time points at the client or
                network; waiting (time to first byte) points at the target.
              </Text>
            </Flex>
          </Card>
        </Grid>

        <Flex justify="between" align="baseline" gap="3">
          <Heading size="3">Whole load test</Heading>
          <Text size="1" color="gray">
            {formatDuration(0)} → {formatDuration(span)}
          </Text>
        </Flex>
        <Grid
          columns="repeat(auto-fit, minmax(320px, 1fr))"
          gap="3"
          align="start"
        >
          <MetricPanel
            title="Running VUsers"
            unit="# of VUsers"
            series={[line('Running', 0, (bucket) => bucket.vus)]}
            start={start}
            end={end}
            format={formatAxisCount}
          />
          <MetricPanel
            title="Trans response time"
            unit="sec"
            series={transactions}
            start={start}
            end={end}
            format={formatTime}
          />
          <MetricPanel
            title="Hits per second"
            unit="# hits/sec"
            series={[
              line('Hits', 0, (bucket) => bucket.requests),
              line('Failed', 1, (bucket) => bucket.failed),
            ]}
            start={start}
            end={end}
            format={formatAxisCount}
          />
          <MetricPanel
            title="Throughput"
            unit="bytes/sec"
            series={[line('Received', 0, (bucket) => bucket.throughput)]}
            start={start}
            end={end}
            format={formatBytes}
          />
        </Grid>

        {transactions.length < stats.groups.length && (
          <Text size="1" color="gray">
            The response time chart draws the first {MAX_SERIES} transactions —
            the rest keep their numbers in the table below.
          </Text>
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

/** The all-caps card heading a controller labels its panels with. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      size="1"
      color="gray"
      weight="medium"
      css={css`
        text-transform: uppercase;
        letter-spacing: 0.08em;
      `}
    >
      {children}
    </Text>
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
