import { Checkbox, Flex, Text, TextField } from '@radix-ui/themes'
import { useMemo } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { useShallow } from 'zustand/react/shallow'

import { FieldGroup } from '@/components/Form'
import { ControlledReactSelect } from '@/components/Form/ControlledReactSelect'
import { selectFilteredRequests, useGeneratorStore } from '@/store/generator'
import { TestRule } from '@/types/rules'

import { useHeaderOptions } from './HeaderSelect.hooks'

export function HeaderSelect({
  field,
}: {
  field: 'extractor.selector' | 'replacer.selector' | 'selector'
}) {
  const {
    watch,
    control,
    register,
    formState: { errors },
  } = useFormContext<TestRule>()
  // Shallow, because the selector builds a new array every time: without it
  // every store write re-derived the header options from the whole recording,
  // which this field sits next to while it is being typed into.
  const requests = useGeneratorStore(useShallow(selectFilteredRequests))

  const filterField = useMemo(() => {
    if (field === 'extractor.selector') {
      return 'extractor.filter'
    }
    if (field === 'replacer.selector') {
      return 'replacer.filter'
    }
    return 'filter'
  }, [field])

  const filter = watch(filterField)
  const extractFrom = field === 'extractor.selector' ? 'response' : 'request'
  const options = useHeaderOptions(requests, extractFrom, filter)

  // Only a parameterization rule can add a header; the picker lists recorded
  // headers, so a header to add is typed in by hand.
  if (field !== 'selector') {
    return (
      <FieldGroup name={`${field}.name`} errors={errors} label="Name">
        <ControlledReactSelect
          name={`${field}.name`}
          control={control}
          options={options}
        />
      </FieldGroup>
    )
  }

  const addIfMissing = watch('selector.addIfMissing') === true

  return (
    <>
      <FieldGroup name="selector.name" errors={errors} label="Name">
        {addIfMissing ? (
          <TextField.Root
            placeholder="Authorization"
            {...register('selector.name')}
          />
        ) : (
          <ControlledReactSelect
            name="selector.name"
            control={control}
            options={options}
          />
        )}
      </FieldGroup>
      <Text as="label" size="2">
        <Flex gap="2" align="center">
          <Controller
            name="selector.addIfMissing"
            control={control}
            render={({ field: checkbox }) => (
              <Checkbox
                checked={checkbox.value === true}
                onCheckedChange={(value) => checkbox.onChange(value === true)}
              />
            )}
          />
          Add to requests missing this header
        </Flex>
      </Text>
    </>
  )
}
