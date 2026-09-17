import { Text } from '@radix-ui/themes'

import { Table } from '@/components/Table'

import { ChangeBadge, formatValue } from './CompareChangeBadge'
import { CompareSection } from './compareRuns'

/** Every compared metric, grouped by section, with its change. */
export function CompareMetricsTable({
  sections,
}: {
  sections: CompareSection[]
}) {
  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Metric</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Base</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Now</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Change</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {sections.map((section) => [
          <Table.Row key={section.title}>
            <Table.Cell colSpan={4}>
              <Text size="1" weight="medium" color="gray">
                {section.title.toUpperCase()}
              </Text>
            </Table.Cell>
          </Table.Row>,
          ...section.rows.map((row) => (
            <Table.Row key={`${section.title}-${row.label}`}>
              <Table.RowHeaderCell>{row.label}</Table.RowHeaderCell>
              <Table.Cell align="right">
                <Text color="gray" wrap="nowrap">
                  {formatValue(row.base, row.format)}
                </Text>
              </Table.Cell>
              <Table.Cell align="right">
                <Text weight="medium" wrap="nowrap">
                  {formatValue(row.current, row.format)}
                </Text>
              </Table.Cell>
              <Table.Cell align="right">
                <ChangeBadge row={row} />
              </Table.Cell>
            </Table.Row>
          )),
        ])}
      </Table.Body>
    </Table.Root>
  )
}
