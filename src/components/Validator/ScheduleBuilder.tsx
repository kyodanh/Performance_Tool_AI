import { css } from '@emotion/react'
import { Flex, RadioGroup, Text, TextField } from '@radix-ui/themes'
import { useState } from 'react'

import { LoadProfileExecutorOptions } from '@/types/testOptions'
import {
  DEFAULT_SCHEDULE,
  Schedule,
  scheduleToProfile,
} from '@/utils/k6/schedule'

interface ScheduleBuilderProps {
  onChange: (profile: LoadProfileExecutorOptions) => void
  disabled?: boolean
}

/**
 * Builds a load profile from a LoadRunner-style scenario schedule, for people
 * who think in "start 100 Vusers, 1 every 00:00:01, run for 00:05:00". It only
 * writes the load profile below — that stays the source of truth for the run and
 * can be edited by hand afterwards.
 */
export function ScheduleBuilder({ onChange, disabled }: ScheduleBuilderProps) {
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)

  // Emits on edit rather than from an effect, so the profile the test already
  // declares survives until the user actually touches this form — and once
  // they do, what the form says is what runs. No Apply step to forget.
  const set = <K extends keyof Schedule>(key: K, value: Schedule[K]) => {
    const next = { ...schedule, [key]: value }

    setSchedule(next)
    onChange(scheduleToProfile(next))
  }

  return (
    <Flex direction="column" gap="3">
      <Flex gap="2" align="center">
        <Text size="2">Start</Text>
        <TextField.Root
          type="number"
          min="1"
          value={String(schedule.vus)}
          disabled={disabled}
          onChange={(event) => set('vus', Number(event.target.value))}
          css={css`
            width: 70px;
          `}
        />
        <Text size="2">Vusers</Text>
      </Flex>

      <RadioGroup.Root
        size="1"
        value={schedule.startMode}
        disabled={disabled}
        onValueChange={(value) =>
          set('startMode', value as Schedule['startMode'])
        }
      >
        <RadioGroup.Item value="simultaneous">Simultaneously</RadioGroup.Item>
        <Flex gap="2" align="center" mt="1">
          <RadioGroup.Item value="gradual" />
          <TextField.Root
            type="number"
            min="1"
            value={String(schedule.stepVus)}
            disabled={disabled || schedule.startMode !== 'gradual'}
            onChange={(event) => set('stepVus', Number(event.target.value))}
            css={css`
              width: 60px;
            `}
          />
          <Text size="2">Vusers every</Text>
          <TextField.Root
            value={schedule.stepEvery}
            disabled={disabled || schedule.startMode !== 'gradual'}
            onChange={(event) => set('stepEvery', event.target.value)}
            css={css`
              width: 90px;
            `}
          />
          <Text size="1" color="gray">
            (HH:MM:SS)
          </Text>
        </Flex>
      </RadioGroup.Root>

      <Text size="2" weight="medium">
        Duration
      </Text>
      <RadioGroup.Root
        size="1"
        value={schedule.durationMode}
        disabled={disabled}
        onValueChange={(value) =>
          set('durationMode', value as Schedule['durationMode'])
        }
      >
        <RadioGroup.Item value="completion">
          Run until completion
        </RadioGroup.Item>
        <Flex gap="2" align="center" mt="1">
          <RadioGroup.Item value="runFor" />
          <Text size="2">Run for</Text>
          <TextField.Root
            value={schedule.runFor}
            disabled={disabled || schedule.durationMode !== 'runFor'}
            onChange={(event) => set('runFor', event.target.value)}
            css={css`
              width: 90px;
            `}
          />
          <Text size="1" color="gray">
            (HH:MM:SS)
          </Text>
        </Flex>
      </RadioGroup.Root>

      <Text size="1" color="gray">
        A gradual start becomes a linear ramp of the same length — k6
        interpolates between stages instead of stepping. Running until
        completion runs one iteration per VU.
      </Text>
    </Flex>
  )
}
