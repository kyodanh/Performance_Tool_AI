import { Text } from '@radix-ui/themes'

import { Table } from '@/components/Table'
import { CheckStats } from '@/utils/k6/stats'

import { formatCount } from './format'

interface ChecksTableProps {
  checks: CheckStats[]
}

/**
 * Per-check results read from the metric stream, so a failing `check()` is
 * visible during a load test — the end-of-test summary is not available there.
 */
export function ChecksTable({ checks }: ChecksTableProps) {
  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Transaction</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Passed</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Failed</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {checks.map((check) => (
          <Table.Row key={`${check.group}|${check.name}`}>
            <Table.Cell>{check.name}</Table.Cell>
            <Table.Cell>{check.group || '—'}</Table.Cell>
            <Table.Cell align="right">{formatCount(check.passes)}</Table.Cell>
            <Table.Cell align="right">
              <Text color={check.fails > 0 ? 'red' : undefined}>
                {formatCount(check.fails)}
              </Text>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}
