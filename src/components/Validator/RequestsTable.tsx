import { css } from '@emotion/react'
import { Text } from '@radix-ui/themes'

import { Table } from '@/components/Table'
import { RequestStats } from '@/utils/k6/stats'

import { formatCount, formatTime } from './format'

interface RequestsTableProps {
  requests: RequestStats[]
}

/**
 * The HTTP requests behind a transaction, one row per method + name + status —
 * so an endpoint answering both 200 and 401 shows as two rows.
 */
export function RequestsTable({ requests }: RequestsTableProps) {
  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell width="70px">Method</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="70px">Status</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Count</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Failed</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Avg</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Max</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {requests.map((request) => (
          <Table.Row
            key={`${request.method}|${request.name}|${request.status}`}
          >
            <Table.Cell>{request.method || '—'}</Table.Cell>
            <Table.Cell
              css={css`
                word-break: break-all;
              `}
            >
              {request.name}
            </Table.Cell>
            <Table.Cell>
              <Text color={isError(request.status) ? 'red' : undefined}>
                {request.status || '—'}
              </Text>
            </Table.Cell>
            <Table.Cell align="right">{formatCount(request.count)}</Table.Cell>
            <Table.Cell align="right">
              <Text color={request.failed > 0 ? 'red' : undefined}>
                {formatCount(request.failed)}
              </Text>
            </Table.Cell>
            <Table.Cell align="right">{formatTime(request.avg)}</Table.Cell>
            <Table.Cell align="right">{formatTime(request.max)}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}

function isError(status: string) {
  return Number(status) >= 400 || status === '0'
}
