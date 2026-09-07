import { useMemo } from 'react'
import { useFormContext } from 'react-hook-form'
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
