import { Checkbox, Flex, Text, TextField } from '@radix-ui/themes'
import { Controller, useFormContext } from 'react-hook-form'

import { AppSettings } from '@/types/settings'
import { stringAsOptionalNumber } from '@/utils/form'

import { FieldGroup } from '../Form'

import { SettingsSection } from './SettingsSection'

export const ScriptSettings = () => {
  const {
    control,
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

      <Text size="2" color="gray" mt="5" mb="2" as="p">
        Export preview
      </Text>

      <Flex gap="2">
        <Controller
          control={control}
          name="script.allowExportEdit"
          render={({ field }) => (
            <Text size="2" as="label">
              <Checkbox
                {...register('script.allowExportEdit')}
                checked={field.value}
                onCheckedChange={field.onChange}
              />{' '}
              Allow editing in the JMeter / LoadRunner tabs.
            </Text>
          )}
        />
      </Flex>

      <Text size="1" color="gray" mt="2" as="p">
        Overview edits are written to the generator, so the k6, JMeter and
        LoadRunner tabs all update together. Raw XML / C edits apply only to
        that tab and to the file it exports — nothing can parse them back into
        rules, so the other tabs keep following the generator.
      </Text>
    </SettingsSection>
  )
}
