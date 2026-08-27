import {
  Badge,
  Button,
  Card,
  Checkbox,
  Flex,
  Table,
  Text,
  TextField,
  Tooltip,
} from '@radix-ui/themes'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { LoadGenerator } from '@/types/loadGenerator'

import { AddLoadGeneratorDialog } from './AddLoadGeneratorDialog'
import { capacityWarning, generatorShare } from './LoadGenerators.utils'

/** Beyond this the per-second buckets from two generators stop lining up. */
const CLOCK_WARNING_SECONDS = 2

function Warning({ children }: { children: string }) {
  return (
    <Tooltip content={children}>
      <Flex align="center" gap="1">
        <TriangleAlertIcon size={14} color="var(--amber-11)" />
        <Text size="1" color="amber">
          Limited
        </Text>
      </Flex>
    </Tooltip>
  )
}

function ClockCell({ offset }: { offset: number }) {
  const seconds = Math.abs(offset)

  if (seconds <= CLOCK_WARNING_SECONDS) {
    return (
      <Text size="1" color="gray">
        {seconds === 0 ? 'in sync' : `${seconds}s — corrected`}
      </Text>
    )
  }

  return (
    <Warning>
      {`Clock is ${seconds}s out. Metrics are shifted by that much, but a drifting clock still smears the per-second charts — enable NTP on the generator.`}
    </Warning>
  )
}

interface LoadGeneratorsProps {
  /** Peak VUs of the chosen profile, used to size the capacity warnings. */
  peakVus: number
  /** Whether this machine takes a share of the load as well as aggregating. */
  useLocal: boolean
  onUseLocalChange: (useLocal: boolean) => void
  /** Weights and participation are fixed for the duration of a run. */
  disabled?: boolean
}

export function LoadGenerators({
  peakVus,
  useLocal,
  onUseLocalChange,
  disabled = false,
}: LoadGeneratorsProps) {
  const [addOpen, setAddOpen] = useState(false)
  const queryClient = useQueryClient()

  // Polled as well as pushed: a generator going quiet produces no event, so
  // without the interval an unplugged machine would sit there looking ready.
  const { data: generators = [] } = useQuery({
    queryKey: ['load-generators'],
    refetchInterval: 5000,
    queryFn: () => window.studio.loadGenerator.getLoadGenerators(),
  })

  useEffect(() => {
    return window.studio.loadGenerator.onLoadGeneratorsChanged((updated) => {
      queryClient.setQueryData(['load-generators'], updated)
    })
  }, [queryClient])

  const ready = generators.filter(
    (generator) => generator.status === 'ready'
  ).length

  // Something has to run the test. Unticking this machine with no generator
  // joined would leave nothing at all.
  const canDropLocal = ready > 0

  useEffect(() => {
    if (!canDropLocal && !useLocal) {
      onUseLocalChange(true)
    }
  }, [canDropLocal, onUseLocalChange, useLocal])

  const handleWeightChange = (generator: LoadGenerator, value: string) => {
    const weight = Number(value)

    if (Number.isFinite(weight) && weight >= 1) {
      window.studio.loadGenerator.setLoadGeneratorWeight(generator.id, weight)
    }
  }

  return (
    <Card size="1" mb="3">
      <Flex align="center" justify="between" mb="2">
        <Flex align="center" gap="2">
          <Text size="2" weight="medium">
            Load generators
          </Text>
          <Text size="1" color="gray">
            {ready === 0
              ? 'This machine only'
              : `${ready} remote${useLocal ? ' + this machine' : ''}`}
          </Text>
        </Flex>
        <Button size="1" variant="soft" onClick={() => setAddOpen(true)}>
          <PlusIcon size={14} /> Add
        </Button>
      </Flex>

      <Table.Root size="1" variant="ghost">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>IP</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Platform</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>k6</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Weight</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Share</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Capacity</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Clock</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>
              <Text as="label" size="1">
                <Flex align="center" gap="2">
                  <Tooltip
                    content={
                      canDropLocal
                        ? 'Untick to leave this machine aggregating only — its CPU then stays out of the measurement.'
                        : 'Add a generator before leaving this machine out; something has to run the test.'
                    }
                  >
                    <Checkbox
                      checked={useLocal}
                      disabled={disabled || !canDropLocal}
                      onCheckedChange={(checked) =>
                        onUseLocalChange(checked === true)
                      }
                    />
                  </Tooltip>
                  This machine
                </Flex>
              </Text>
            </Table.Cell>
            <Table.Cell>
              <Text size="1" color="gray">
                controller
              </Text>
            </Table.Cell>
            <Table.Cell>{window.studio.platform}</Table.Cell>
            <Table.Cell>bundled</Table.Cell>
            <Table.Cell>{useLocal ? 1 : '—'}</Table.Cell>
            <Table.Cell>
              {useLocal
                ? `${peakVus - generators.reduce((sum, generator) => sum + generatorShare(generator, generators, peakVus, useLocal), 0)} VUs`
                : '—'}
            </Table.Cell>
            <Table.Cell />
            <Table.Cell>
              <Text size="1" color="gray">
                reference
              </Text>
            </Table.Cell>
            <Table.Cell>
              <Badge color={useLocal ? 'green' : 'gray'}>
                {useLocal ? 'Ready' : 'Aggregating'}
              </Badge>
            </Table.Cell>
            <Table.Cell />
          </Table.Row>

          {generators.map((generator) => {
            const share = generatorShare(
              generator,
              generators,
              peakVus,
              useLocal
            )
            const warning = capacityWarning(generator, share)

            return (
              <Table.Row key={generator.id}>
                <Table.Cell>{generator.hostname}</Table.Cell>
                <Table.Cell>{generator.ip}</Table.Cell>
                <Table.Cell>
                  {generator.os}/{generator.arch}
                </Table.Cell>
                <Table.Cell>{generator.k6Version}</Table.Cell>
                <Table.Cell>
                  <TextField.Root
                    size="1"
                    type="number"
                    min={1}
                    max={100}
                    style={{ width: '4.5rem' }}
                    disabled={disabled}
                    value={String(generator.weight)}
                    aria-label={`Weight for ${generator.hostname}`}
                    onChange={(event) =>
                      handleWeightChange(generator, event.target.value)
                    }
                  />
                </Table.Cell>
                <Table.Cell>{share} VUs</Table.Cell>
                <Table.Cell>
                  {warning === null ? (
                    <Text size="1" color="gray">
                      {generator.ports}
                    </Text>
                  ) : (
                    <Warning>{warning}</Warning>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <ClockCell offset={generator.clockOffset} />
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    color={generator.status === 'ready' ? 'green' : 'gray'}
                  >
                    {generator.status === 'ready' ? 'Ready' : 'Offline'}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Button
                    size="1"
                    variant="ghost"
                    color="red"
                    disabled={disabled}
                    onClick={() =>
                      window.studio.loadGenerator.disconnectLoadGenerator(
                        generator.id
                      )
                    }
                  >
                    Disconnect
                  </Button>
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>

      <AddLoadGeneratorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        count={generators.length}
      />
    </Card>
  )
}
