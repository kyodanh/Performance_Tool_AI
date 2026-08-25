import { Button, Flex, RadioGroup, Text, TextField } from '@radix-ui/themes'
import { useState } from 'react'

import { FieldError } from '@/components/Form'
import { TimingSchema } from '@/schemas/generator'
import { useGeneratorStore } from '@/store/generator'
import { ProxyData } from '@/types'
import { Timing } from '@/types/testOptions'
import {
  createFixedTiming,
  createRangeTiming,
  requestKey,
} from '@/utils/thinkTime'

interface ThinkTimeFormProps {
  data: ProxyData
  onClear: () => void
}

/**
 * Think time for a single request, overriding whatever Test options set. Keyed
 * by `requestKey`, so identical requests share it.
 */
export function ThinkTimeForm({ data, onClear }: ThinkTimeFormProps) {
  const key = requestKey(data)
  const override = useGeneratorStore((state) => state.thinkTimeOverrides[key])
  const setThinkTimeOverride = useGeneratorStore(
    (state) => state.setThinkTimeOverride
  )

  const [draft, setDraft] = useState<Timing>(override ?? createFixedTiming())

  const parsed = TimingSchema.safeParse(draft)
  const error = parsed.success ? undefined : parsed.error.issues[0]?.message

  // Only valid values reach the store, an invalid draft leaves the last good
  // one in place instead of breaking the generator file.
  function handleChange(next: Timing) {
    setDraft(next)

    if (TimingSchema.safeParse(next).success) {
      setThinkTimeOverride(key, next)
    }
  }

  function handleClear() {
    setThinkTimeOverride(key, null)
    onClear()
  }

  return (
    <>
      <Text as="p" size="1" color="gray" mb="2">
        Wait after this request, instead of the think time in Test options.
      </Text>

      <RadioGroup.Root
        value={draft.type}
        onValueChange={(type) =>
          handleChange(
            type === 'fixed' ? createFixedTiming() : createRangeTiming()
          )
        }
        mb="2"
      >
        <Flex gap="3">
          <RadioGroup.Item value="fixed">Fixed</RadioGroup.Item>
          <RadioGroup.Item value="range">Random</RadioGroup.Item>
        </Flex>
      </RadioGroup.Root>

      <Flex gap="2" mb="1">
        {draft.type === 'fixed' && (
          <TextField.Root
            aria-label="Duration"
            size="1"
            type="number"
            min="0"
            placeholder="e.g. 1"
            value={draft.value ?? ''}
            onChange={(event) =>
              handleChange({
                type: 'fixed',
                value:
                  event.target.value === '' ? null : Number(event.target.value),
              })
            }
          >
            <TextField.Slot side="right">s</TextField.Slot>
          </TextField.Root>
        )}

        {draft.type === 'range' && (
          <>
            <TextField.Root
              aria-label="Min duration"
              size="1"
              type="number"
              min="0"
              value={draft.value.min}
              onChange={(event) =>
                handleChange(
                  createRangeTiming(Number(event.target.value), draft.value.max)
                )
              }
            >
              <TextField.Slot side="right">s</TextField.Slot>
            </TextField.Root>
            <TextField.Root
              aria-label="Max duration"
              size="1"
              type="number"
              min="0"
              value={draft.value.max}
              onChange={(event) =>
                handleChange(
                  createRangeTiming(draft.value.min, Number(event.target.value))
                )
              }
            >
              <TextField.Slot side="right">s</TextField.Slot>
            </TextField.Root>
          </>
        )}
      </Flex>

      {error && <FieldError>{error}</FieldError>}

      {override && (
        <Button
          variant="soft"
          color="gray"
          size="1"
          mt="2"
          onClick={handleClear}
        >
          Use global think time
        </Button>
      )}
    </>
  )
}
