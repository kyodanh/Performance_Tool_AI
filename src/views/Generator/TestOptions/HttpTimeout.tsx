import { Box, Text, TextField } from '@radix-ui/themes'

import { FieldGroup } from '@/components/Form'
import { DEFAULT_HTTP_TIMEOUT } from '@/schemas/generator'
import { useGeneratorStore } from '@/store/generator'

export function HttpTimeout() {
  const httpTimeout = useGeneratorStore((store) => store.httpTimeout)
  const setHttpTimeout = useGeneratorStore((store) => store.setHttpTimeout)

  // ponytail: no form library here, it is one positive number — ignore
  // intermediate invalid input instead of validating and rendering an error.
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value)

    if (Number.isFinite(value) && value > 0) {
      setHttpTimeout(value)
    }
  }

  return (
    <>
      <Text size="2" as="p" mb="2">
        How long a request may take before it is counted as failed. Applies to
        every request in the script and to JMeter / LoadRunner exports.
      </Text>
      <Box width="50%">
        <FieldGroup
          name="httpTimeout"
          label="Request timeout"
          hint={`Defaults to ${DEFAULT_HTTP_TIMEOUT}s. Keep it close to your SLA so a hung server fails fast instead of holding a VU.`}
        >
          <TextField.Root
            size="2"
            min="1"
            type="number"
            id="httpTimeout"
            defaultValue={httpTimeout}
            onChange={handleChange}
          >
            <TextField.Slot side="right">s</TextField.Slot>
          </TextField.Root>
        </FieldGroup>
      </Box>
    </>
  )
}
