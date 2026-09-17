import { css } from '@emotion/react'
import { Badge, Callout, Flex, ScrollArea, Text } from '@radix-ui/themes'
import { CheckIcon, InfoIcon, XIcon } from 'lucide-react'

import { Table } from '@/components/Table'
import { describeSla, Sla, SlaRow, SlaScope, SlaVerdict } from '@/utils/k6/sla'

import { formatCount, formatOptionalTime } from './format'

const SCOPE_LABELS: Record<SlaScope, string> = {
  run: 'Run',
  transaction: 'Transaction',
  request: 'Endpoint',
}

/** The headline a report is signed off on. */
export function SlaBadge({ verdict }: { verdict: SlaVerdict | null }) {
  if (verdict === null) {
    return null
  }

  return (
    <Badge
      size="2"
      radius="full"
      color={verdict.passed ? 'green' : 'red'}
      variant="solid"
    >
      {verdict.passed ? <CheckIcon size={14} /> : <XIcon size={14} />}
      {verdict.passed ? 'SLA met' : `SLA missed (${verdict.failedRows})`}
    </Badge>
  )
}

function breachColor(row: SlaRow, breach: SlaRow['breached'][number]) {
  return row.breached.includes(breach) ? 'red' : undefined
}

interface SlaSectionProps {
  sla: Sla
  verdict: SlaVerdict | null
}

/**
 * Every level of the run against its ceilings, worst first — the table a
 * sign-off report is read from. A row whose statistic the run never recorded
 * shows a dash and is not counted against the verdict.
 */
export function SlaSection({ sla, verdict }: SlaSectionProps) {
  if (verdict === null) {
    return (
      <Flex p="3">
        <Callout.Root size="1">
          <Callout.Icon>
            <InfoIcon />
          </Callout.Icon>
          <Callout.Text>
            Turn on the service level check in the panel on the left to judge
            the run against it.
          </Callout.Text>
        </Callout.Root>
      </Flex>
    )
  }

  // Failures first: a long run has one row per endpoint, and the point of the
  // tab is what missed.
  const rows = [...verdict.rows].sort(
    (a, b) => Number(a.passed) - Number(b.passed)
  )

  return (
    <ScrollArea scrollbars="vertical">
      <Flex direction="column" gap="3" p="2">
        <Flex align="center" gap="3">
          <SlaBadge verdict={verdict} />
          <Text size="1" color="gray">
            {describeSla(sla)} · {verdict.rows.length} row(s) checked
          </Text>
        </Flex>

        <Table.Root size="1" variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell width="110px">
                Scope
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                Count
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                {sla.statistic}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                Error %
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell width="90px">
                Result
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={`${row.scope}|${row.name}`}>
                <Table.Cell>
                  <Text size="1" color="gray">
                    {SCOPE_LABELS[row.scope]}
                  </Text>
                </Table.Cell>
                <Table.Cell
                  css={css`
                    word-break: break-all;
                  `}
                >
                  {row.name}
                </Table.Cell>
                <Table.Cell align="right">{formatCount(row.count)}</Table.Cell>
                <Table.Cell align="right">
                  <Text color={breachColor(row, 'responseTime')}>
                    {formatOptionalTime(row.responseTime ?? undefined)}
                  </Text>
                </Table.Cell>
                <Table.Cell align="right">
                  <Text color={breachColor(row, 'errorRate')}>
                    {row.errorRate.toFixed(2)}%
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={row.passed ? 'green' : 'red'} variant="soft">
                    {row.passed ? 'Pass' : 'Fail'}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Flex>
    </ScrollArea>
  )
}
