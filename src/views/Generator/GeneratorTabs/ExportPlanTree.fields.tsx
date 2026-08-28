import { Checkbox, Flex, Text, TextField } from '@radix-ui/themes'

import { RampingStageSchema } from '@/schemas/generator'
import { useGeneratorStore } from '@/store/generator'
import { Timing } from '@/types/testOptions'
import { createFixedTiming } from '@/utils/thinkTime'

/**
 * Every field here writes straight into the generator store, which is what the
 * k6, JMeter and LoadRunner previews are all derived from — so an edit made in
 * one tab shows up in all three.
 */

function NumberField({
  label,
  value,
  suffix,
  // A ramping stage may target 0 VUs (ramp-down), everything else starts at 1.
  min = 1,
  onChange,
}: {
  label: string
  value: number | undefined
  suffix?: string
  min?: number
  onChange: (value: number) => void
}) {
  // ponytail: same as HttpTimeout — ignore intermediate invalid input instead
  // of wiring up a form library for one number.
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const parsed = Number(event.target.value)

    if (Number.isFinite(parsed) && parsed >= min) {
      onChange(parsed)
    }
  }

  return (
    <Flex align="center" gap="2">
      <Text size="1" color="gray">
        {label}
      </Text>
      <TextField.Root
        size="1"
        type="number"
        min={min}
        aria-label={label}
        defaultValue={value}
        onChange={handleChange}
        css={{ width: '5.5rem' }}
      >
        {suffix && <TextField.Slot side="right">{suffix}</TextField.Slot>}
      </TextField.Root>
    </Flex>
  )
}

export function TimeoutField({ editable }: { editable: boolean }) {
  const httpTimeout = useGeneratorStore((store) => store.httpTimeout)
  const setHttpTimeout = useGeneratorStore((store) => store.setHttpTimeout)

  if (!editable) {
    return <Value>timeout {httpTimeout}s</Value>
  }

  return (
    <NumberField
      label="Timeout"
      value={httpTimeout}
      suffix="s"
      onChange={setHttpTimeout}
    />
  )
}

export function LoadFields({ editable }: { editable: boolean }) {
  const executor = useGeneratorStore((store) => store.executor)
  const vus = useGeneratorStore((store) => store.vus)
  const iterations = useGeneratorStore((store) => store.iterations)
  const stages = useGeneratorStore((store) => store.stages)
  const setVus = useGeneratorStore((store) => store.setVus)
  const setIterations = useGeneratorStore((store) => store.setIterations)
  const setStages = useGeneratorStore((store) => store.setStages)

  if (executor === 'shared-iterations') {
    if (!editable) {
      return (
        <Value>
          {vus ?? 1} VUs · {iterations ?? 1} iterations
        </Value>
      )
    }

    return (
      <Flex gap="4" wrap="wrap">
        <NumberField label="VUs" value={vus} onChange={setVus} />
        <NumberField
          label="Iterations"
          value={iterations}
          onChange={setIterations}
        />
      </Flex>
    )
  }

  if (!editable) {
    return (
      <Value>
        {stages
          .map((stage) => `${stage.target} VUs / ${stage.duration}`)
          .join(' → ')}
      </Value>
    )
  }

  function updateStage(
    index: number,
    patch: { target?: number; duration?: string }
  ) {
    setStages(
      stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage))
    )
  }

  return (
    <Flex direction="column" gap="1">
      {stages.map((stage, index) => (
        <Flex key={stage.key} gap="4" align="center" wrap="wrap">
          <Text size="1" color="gray">
            Stage {index + 1}
          </Text>
          <NumberField
            label="Target"
            value={stage.target}
            suffix="VUs"
            min={0}
            onChange={(target) => updateStage(index, { target })}
          />
          <Flex align="center" gap="2">
            <Text size="1" color="gray">
              Duration
            </Text>
            <TextField.Root
              size="1"
              aria-label={`Stage ${index + 1} duration`}
              defaultValue={stage.duration}
              css={{ width: '5.5rem' }}
              onChange={(event) => {
                const duration = event.target.value

                if (
                  RampingStageSchema.shape.duration.safeParse(duration).success
                ) {
                  updateStage(index, { duration })
                }
              }}
            />
          </Flex>
        </Flex>
      ))}
    </Flex>
  )
}

export function RequestFields({
  requestKey,
  thinkTime,
  rendezvous,
}: {
  requestKey: string
  thinkTime: Timing | null
  rendezvous: boolean
}) {
  const setThinkTimeOverride = useGeneratorStore(
    (store) => store.setThinkTimeOverride
  )
  const toggleRendezvous = useGeneratorStore((store) => store.toggleRendezvous)

  return (
    <Flex gap="4" align="center" wrap="wrap">
      <NumberField
        label="Think time"
        value={
          thinkTime?.type === 'fixed'
            ? (thinkTime.value ?? undefined)
            : undefined
        }
        suffix="s"
        onChange={(value) =>
          setThinkTimeOverride(requestKey, createFixedTiming(value))
        }
      />
      {thinkTime !== null && (
        <Text
          size="1"
          color="gray"
          css={{ cursor: 'var(--cursor-button)', textDecoration: 'underline' }}
          onClick={() => setThinkTimeOverride(requestKey, null)}
        >
          reset
        </Text>
      )}
      <Text size="1" as="label" color="gray">
        <Checkbox
          size="1"
          checked={rendezvous}
          onCheckedChange={() => toggleRendezvous(requestKey)}
        />{' '}
        Rendezvous
      </Text>
    </Flex>
  )
}

export function Value({ children }: { children: React.ReactNode }) {
  return (
    <Text size="1" color="gray">
      {children}
    </Text>
  )
}
