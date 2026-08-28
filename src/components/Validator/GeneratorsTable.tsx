import { Text } from '@radix-ui/themes'

import { Table } from '@/components/Table'
import { GeneratorStats, LOCAL_SOURCE } from '@/utils/k6/stats'

import { formatBytes, formatCount, formatTime } from './format'

interface GeneratorsTableProps {
  generators: GeneratorStats[]
}

/**
 * What each machine contributed to a distributed run. The totals above merge
 * every generator, so without this a run split across machines gives no way to
 * tell an overloaded generator from a slow target.
 */
export function GeneratorsTable({ generators }: GeneratorsTableProps) {
  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Machine</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">VUs</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Peak</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">
            Requests
          </Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Failed</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">
            Iterations
          </Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Avg</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Max</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">
            Data received
          </Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {generators.map((generator) => (
          <Table.Row key={generator.source}>
            <Table.RowHeaderCell>
              {generator.source === LOCAL_SOURCE ? (
                <Text>This machine</Text>
              ) : (
                generator.source
              )}
            </Table.RowHeaderCell>
            <Table.Cell align="right">{formatCount(generator.vus)}</Table.Cell>
            <Table.Cell align="right">
              {formatCount(generator.vusMax)}
            </Table.Cell>
            <Table.Cell align="right">
              {formatCount(generator.requests)}
            </Table.Cell>
            <Table.Cell align="right">
              <Text color={generator.failedRequests > 0 ? 'red' : undefined}>
                {formatCount(generator.failedRequests)}
              </Text>
            </Table.Cell>
            <Table.Cell align="right">
              {formatCount(generator.iterations)}
            </Table.Cell>
            <Table.Cell align="right">
              {formatTime(generator.avgDuration)}
            </Table.Cell>
            <Table.Cell align="right">
              {formatTime(generator.maxDuration)}
            </Table.Cell>
            <Table.Cell align="right">
              {formatBytes(generator.dataReceived)}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}
