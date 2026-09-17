import { css } from '@emotion/react'
import { Card, Checkbox, Flex, Select, Text, TextField } from '@radix-ui/themes'

import { Sla, SLA_STATISTICS } from '@/utils/k6/sla'

import { PanelTitle } from './ScheduleBuilder'

interface SlaPanelProps {
  value: Sla
  onChange: (value: Sla) => void
  disabled?: boolean
}

const fieldStyles = css`
  width: 84px;
`

/**
 * The service level the run is judged against — one ceiling for response time
 * and one for errors, applied to the run as a whole, to every transaction and
 * to every endpoint. Kept next to the schedule because it is set once, before
 * the run, the same way the load profile is.
 */
export function SlaPanel({ value, onChange, disabled }: SlaPanelProps) {
  const set = <K extends keyof Sla>(key: K, next: Sla[K]) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <Card size="2">
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center" gap="2">
          <PanelTitle>Service level</PanelTitle>
          <Text as="label" size="1" color="gray">
            <Flex gap="2" align="center">
              <Checkbox
                checked={value.enabled}
                disabled={disabled}
                onCheckedChange={(checked) => set('enabled', checked === true)}
              />
              Check
            </Flex>
          </Text>
        </Flex>

        <Flex gap="2" align="center" wrap="wrap">
          <Select.Root
            size="1"
            value={value.statistic}
            disabled={disabled || !value.enabled}
            onValueChange={(statistic) =>
              set('statistic', statistic as Sla['statistic'])
            }
          >
            <Select.Trigger />
            <Select.Content>
              {SLA_STATISTICS.map((statistic) => (
                <Select.Item key={statistic} value={statistic}>
                  {statistic}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text size="2">≤</Text>
          <TextField.Root
            type="number"
            min="0"
            size="1"
            value={String(value.responseTimeMs)}
            disabled={disabled || !value.enabled}
            onChange={(event) =>
              set('responseTimeMs', Number(event.target.value))
            }
            css={fieldStyles}
          />
          <Text size="1" color="gray">
            ms
          </Text>
        </Flex>

        <Flex gap="2" align="center" wrap="wrap">
          <Text size="2">Errors ≤</Text>
          <TextField.Root
            type="number"
            min="0"
            max="100"
            step="0.1"
            size="1"
            value={String(value.errorRatePercent)}
            disabled={disabled || !value.enabled}
            onChange={(event) =>
              set('errorRatePercent', Number(event.target.value))
            }
            css={fieldStyles}
          />
          <Text size="1" color="gray">
            % of executions
          </Text>
        </Flex>

        <Text as="p" size="1" color="gray">
          Applied to the run total, each transaction and each endpoint. One row
          over a ceiling fails the run.
        </Text>
      </Flex>
    </Card>
  )
}
