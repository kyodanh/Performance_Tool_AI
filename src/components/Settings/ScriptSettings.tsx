import { Text, TextField } from '@radix-ui/themes'
import { useFormContext } from 'react-hook-form'

import { AppSettings } from '@/types/settings'
import { stringAsOptionalNumber } from '@/utils/form'

import { FieldGroup } from '../Form'

import { SettingsSection } from './SettingsSection'

export const ScriptSettings = () => {
  const {
    register,
    formState: { errors },
  } = useFormContext<AppSettings>()

  return (
    <SettingsSection>
      <Text size="2" color="gray" mb="4" as="p">
        Defaults for newly created generators. Existing generators keep their
        own values — change those in Test options.
      </Text>

      <FieldGroup
        name="script.httpTimeout"
        label="HTTP request timeout"
        errors={errors}
        hint="How long a request may take before the test counts it as failed. Applies to the generated k6 script and to JMeter / LoadRunner exports."
        hintType="text"
      >
        <TextField.Root
          size="2"
          min="1"
          type="number"
          id="script.httpTimeout"
          {...register('script.httpTimeout', {
            setValueAs: stringAsOptionalNumber,
          })}
        >
          <TextField.Slot side="right">s</TextField.Slot>
        </TextField.Root>
      </FieldGroup>
    </SettingsSection>
  )
}
