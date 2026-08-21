import { css } from '@emotion/react'
import { Button, Callout, DataList, Dialog, Flex, Text } from '@radix-ui/themes'
import { useState } from 'react'

import { Table } from '@/components/Table'
import {
  CheckStats,
  GroupStats,
  RequestStats,
  RunErrorGroup,
} from '@/utils/k6/stats'

import { ChecksTable } from './ChecksTable'
import { ErrorsTable } from './ErrorsTable'
import { formatCount, formatTime } from './format'
import { RequestsTable } from './RequestsTable'
import { SERIES_COLORS, SERIES_DASHES, chartedSeries } from './TransactionChart'

function tps(count: number, elapsed: number) {
  return (count / Math.max(1, elapsed)).toFixed(2)
}

interface TransactionsTableProps {
  groups: GroupStats[]
  /** Seconds the run has been producing samples, used for the TPS column. */
  elapsed: number
  /** Used to list the errors that hit the selected transaction. */
  errors: RunErrorGroup[]
  /** Used to list the checks that ran inside the selected transaction. */
  checks: CheckStats[]
  /** Used to list the requests the selected transaction made. */
  requests: RequestStats[]
}

/**
 * One row per k6 `group()` — the closest thing k6 has to a controller
 * transaction. A row opens its own detail, including the errors tagged with it.
 * `Passed` is derived: k6 records no verdict per group execution, only the
 * failures tagged with it (see `GroupStats.failed`).
 */
export function TransactionsTable({
  groups,
  elapsed,
  errors,
  checks,
  requests,
}: TransactionsTableProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const group = groups.find((item) => item.name === selected)
  const groupErrors = errors.filter((error) => error.group === selected)
  const groupChecks = checks.filter((check) => check.group === selected)
  const groupRequests = requests.filter((request) => request.group === selected)
  const charted = chartedSeries(groups)

  return (
    <>
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">TPS</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Passed
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Failed
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Min</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Avg</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Max</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Std</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Last</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {groups.map((item) => (
            <Table.Row
              key={item.name}
              onClick={() => setSelected(item.name)}
              css={rowStyles}
            >
              <Table.Cell>
                <Flex align="center" gap="2">
                  <SeriesMark index={charted.indexOf(item.name)} />
                  {item.name}
                </Flex>
              </Table.Cell>
              <Table.Cell align="right">{tps(item.count, elapsed)}</Table.Cell>
              <Table.Cell align="right">
                {formatCount(Math.max(0, item.count - item.failed))}
              </Table.Cell>
              <Table.Cell align="right">
                <Text color={item.failed > 0 ? 'red' : undefined}>
                  {formatCount(item.failed)}
                </Text>
              </Table.Cell>
              <Table.Cell align="right">{formatTime(item.min)}</Table.Cell>
              <Table.Cell align="right">{formatTime(item.avg)}</Table.Cell>
              <Table.Cell align="right">{formatTime(item.max)}</Table.Cell>
              <Table.Cell align="right">{formatTime(item.std)}</Table.Cell>
              <Table.Cell align="right">{formatTime(item.last)}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      <Dialog.Root
        open={group !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
      >
        <Dialog.Content maxWidth="900px" width="90vw">
          <Dialog.Title size="4">{group?.name}</Dialog.Title>
          {group && (
            <Flex direction="column" gap="3">
              <DataList.Root size="1" orientation="horizontal">
                <DataList.Item>
                  <DataList.Label minWidth="88px">Executions</DataList.Label>
                  <DataList.Value>{formatCount(group.count)}</DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">Passed</DataList.Label>
                  <DataList.Value>
                    {formatCount(Math.max(0, group.count - group.failed))}
                  </DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">Failed</DataList.Label>
                  <DataList.Value>
                    <Text color={group.failed > 0 ? 'red' : undefined}>
                      {formatCount(group.failed)}
                    </Text>
                  </DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">TPS</DataList.Label>
                  <DataList.Value>{tps(group.count, elapsed)}</DataList.Value>
                </DataList.Item>
                <DataList.Item>
                  <DataList.Label minWidth="88px">Response time</DataList.Label>
                  <DataList.Value>
                    {formatTime(group.avg)} avg / {formatTime(group.max)} max
                  </DataList.Value>
                </DataList.Item>
              </DataList.Root>

              {groupRequests.length > 0 && (
                <Detail title="Requests">
                  <RequestsTable requests={groupRequests} />
                </Detail>
              )}

              {groupChecks.length > 0 && (
                <Detail title="Checks">
                  <ChecksTable checks={groupChecks} />
                </Detail>
              )}

              {groupErrors.length > 0 && (
                <Detail title="Errors">
                  <ErrorsTable errors={groupErrors} />
                </Detail>
              )}

              {groupRequests.length === 0 &&
                groupChecks.length === 0 &&
                groupErrors.length === 0 && (
                  <Callout.Root size="1" color="gray">
                    <Callout.Text>
                      Nothing was tagged with this transaction yet.
                    </Callout.Text>
                  </Callout.Root>
                )}
            </Flex>
          )}
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

function Detail({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        {title}
      </Text>
      {children}
    </Flex>
  )
}

const rowStyles = css`
  cursor: pointer;

  &:hover {
    background-color: var(--gray-3);
  }
`

/** The chart's line for a transaction, so the legend matches what is plotted. */
function SeriesMark({ index }: { index: number }) {
  if (index === -1) {
    return <svg width="16" height="8" aria-hidden />
  }

  return (
    <svg width="16" height="8" aria-hidden>
      <line
        x1="0"
        x2="16"
        y1="4"
        y2="4"
        stroke={SERIES_COLORS[index]}
        strokeDasharray={SERIES_DASHES[index]}
        strokeWidth="2"
      />
    </svg>
  )
}
