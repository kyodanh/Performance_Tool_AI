import { Badge, Text } from '@radix-ui/themes'

import { Table } from '@/components/Table'
import { SlaVerdict } from '@/utils/k6/sla'

import { ChangeBadge, formatValue } from './CompareChangeBadge'
import { TransactionCompareRow } from './compareRuns'

interface CompareTransactionsTableProps {
  transactions: TransactionCompareRow[]
  /** The current run's SLA verdict; the SLA column shows only when it is on. */
  verdict: SlaVerdict | null
}

const HEADERS = [
  'Base 90%',
  'Now 90%',
  'Change',
  'Base fail',
  'Now fail',
  'Change',
]

export function CompareTransactionsTable({
  transactions,
  verdict,
}: CompareTransactionsTableProps) {
  const slaRow = (name: string) =>
    verdict?.rows.find(
      (row) => row.scope === 'transaction' && row.name === name
    )

  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Transaction</Table.ColumnHeaderCell>
          {HEADERS.map((header, index) => (
            <Table.ColumnHeaderCell key={index} align="right">
              {header}
            </Table.ColumnHeaderCell>
          ))}
          {verdict !== null && (
            <Table.ColumnHeaderCell align="right">SLA</Table.ColumnHeaderCell>
          )}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {transactions.map((transaction) => {
          const sla = slaRow(transaction.name)

          return (
            <Table.Row key={transaction.name}>
              <Table.RowHeaderCell>{transaction.name}</Table.RowHeaderCell>
              {[transaction.p90, transaction.failRate].map((row) => [
                <Table.Cell key={`${row.label}-base`} align="right">
                  <Text color="gray" wrap="nowrap">
                    {formatValue(row.base, row.format)}
                  </Text>
                </Table.Cell>,
                <Table.Cell key={`${row.label}-now`} align="right">
                  <Text weight="medium" wrap="nowrap">
                    {formatValue(row.current, row.format)}
                  </Text>
                </Table.Cell>,
                <Table.Cell key={`${row.label}-change`} align="right">
                  <ChangeBadge row={row} />
                </Table.Cell>,
              ])}
              {verdict !== null && (
                <Table.Cell align="right">
                  {sla === undefined ? (
                    // Only in the base run — nothing to judge now.
                    <Text color="gray">—</Text>
                  ) : (
                    <Badge color={sla.passed ? 'green' : 'red'} variant="soft">
                      {sla.passed ? 'Pass' : 'Fail'}
                    </Badge>
                  )}
                </Table.Cell>
              )}
            </Table.Row>
          )
        })}
      </Table.Body>
    </Table.Root>
  )
}
