import { Text } from '@radix-ui/themes'

import { Table } from '@/components/Table'
import { MachineResources } from '@/types/systemMetrics'

import { formatBytes } from './format'

interface ResourcesTableProps {
  resources: MachineResources[]
}

/** Over this a machine is measuring its own contention as much as the target. */
const CPU_WARNING_PERCENT = 85

/**
 * CPU and memory of the machines driving the run. Without it a run that got slow
 * because a generator ran out of cores looks the same as a slow target.
 */
export function ResourcesTable({ resources }: ResourcesTableProps) {
  return (
    <>
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Machine</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Cores</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">CPU</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              CPU peak
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">RAM</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              RAM peak
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              RAM total
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {resources.map((machine) => (
            <Table.Row key={machine.id}>
              <Table.Cell>{machine.name}</Table.Cell>
              <Table.Cell align="right">{machine.cpuCount}</Table.Cell>
              <Table.Cell align="right">{machine.cpuPercent}%</Table.Cell>
              <Table.Cell align="right">
                <Text
                  color={
                    machine.peakCpuPercent >= CPU_WARNING_PERCENT
                      ? 'amber'
                      : undefined
                  }
                >
                  {machine.peakCpuPercent}%
                </Text>
              </Table.Cell>
              <Table.Cell align="right">
                {formatBytes(machine.memUsedBytes)}
              </Table.Cell>
              <Table.Cell align="right">
                {formatBytes(machine.peakMemUsedBytes)}
              </Table.Cell>
              <Table.Cell align="right">
                {formatBytes(machine.memTotalBytes)}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Text size="1" color="gray">
        This machine is sampled every 2s while the run is in flight; a remote
        generator reports its own on each heartbeat. Memory is what the OS
        counts as unavailable, so the accounting differs a little between
        platforms.
      </Text>
    </>
  )
}
