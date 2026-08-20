import { css } from '@emotion/react'
import { Box, Callout, DataList, Flex, ScrollArea } from '@radix-ui/themes'
import { InfoIcon } from 'lucide-react'

import { Table } from '@/components/Table'
import { RunStats, StatsBucket } from '@/utils/k6/stats'

import { Sparkline } from './Sparkline'

/**
 * The newest bucket is the current, partial second — and each metric flushes on
 * its own beat — so a series' headline value is its last non-zero sample.
 */
function currentValue(values: number[]) {
  return values.findLast((value) => value > 0) ?? 0
}

function formatCount(value: number) {
  return value.toLocaleString()
}

function formatMs(value: number) {
  return `${value.toFixed(value < 10 ? 2 : 0)} ms`
}

function formatBytes(value: number) {
  const units = ['B', 'kB', 'MB', 'GB']

  let size = value
  let unit = 0

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }

  return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`
}

const SERIES: Array<{
  label: string
  select: (bucket: StatsBucket) => number
  format: (value: number) => string
}> = [
  { label: 'Running VUs', select: (b) => b.vus, format: formatCount },
  { label: 'Requests/s', select: (b) => b.requests, format: formatCount },
  { label: 'Response time', select: (b) => b.duration, format: formatMs },
  {
    label: 'Throughput',
    select: (b) => b.throughput,
    format: (value) => `${formatBytes(value)}/s`,
  },
]

interface MetricsSectionProps {
  stats: RunStats | null
}

export function MetricsSection({ stats }: MetricsSectionProps) {
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

  return (
    <ScrollArea scrollbars="vertical">
      <Flex direction="column" gap="3" p="3">
        <DataList.Root size="1" orientation="horizontal">
          <DataList.Item>
            <DataList.Label minWidth="88px">VUs</DataList.Label>
            <DataList.Value>
              {stats.vus} / {stats.vusMax}
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Requests</DataList.Label>
            <DataList.Value>{formatCount(stats.requests)}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Failed</DataList.Label>
            <DataList.Value>{formatCount(stats.failedRequests)}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Iterations</DataList.Label>
            <DataList.Value>{formatCount(stats.iterations)}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label minWidth="88px">Response time</DataList.Label>
            <DataList.Value>
              {formatMs(stats.avgDuration)} avg / {formatMs(stats.maxDuration)}{' '}
              max
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
              />
            )
          })}
        </Flex>

        {stats.groups.length > 0 && (
          <Section title="Transactions">
            <Table.Root size="1" variant="surface">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Group</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell align="right">
                    Count
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell align="right">
                    Avg
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell align="right">
                    Max
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {stats.groups.map((group) => (
                  <Table.Row key={group.name}>
                    <Table.Cell>{group.name}</Table.Cell>
                    <Table.Cell align="right">
                      {formatCount(group.count)}
                    </Table.Cell>
                    <Table.Cell align="right">{formatMs(group.avg)}</Table.Cell>
                    <Table.Cell align="right">{formatMs(group.max)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Section>
        )}

        {stats.errors.length > 0 && (
          <Section title="Errors">
            <Table.Root size="1" variant="surface">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell width="80px">
                    Code
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell width="80px" align="right">
                    Count
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Message</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Request</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {stats.errors.map((error) => (
                  <Table.Row
                    key={`${error.code}|${error.message}|${error.url}`}
                  >
                    <Table.Cell>{error.code || '—'}</Table.Cell>
                    <Table.Cell align="right">
                      {formatCount(error.count)}
                    </Table.Cell>
                    <Table.Cell>{error.message}</Table.Cell>
                    <Table.Cell
                      css={css`
                        word-break: break-all;
                      `}
                    >
                      {error.url}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Section>
        )}
      </Flex>
    </ScrollArea>
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
