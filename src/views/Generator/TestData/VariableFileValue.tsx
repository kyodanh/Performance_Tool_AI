import { Code, Flex } from '@radix-ui/themes'
import { useMemo } from 'react'
import { Control, FieldErrors, useWatch } from 'react-hook-form'

import { ControlledSelect, FieldGroup } from '@/components/Form'
import { useGeneratorStore } from '@/store/generator'
import { TestData } from '@/types/testData'
import * as path from '@/utils/path'
import { useDataFilePreview } from '@/views/DataFile/DataFile.hooks'

type VariablesForm = Pick<TestData, 'variables'>

interface VariableFileValueProps {
  control: Control<VariablesForm>
  errors: FieldErrors<VariablesForm>
  index: number
}

/** Value cell for a variable bound to a data file column: file + column select. */
export function VariableFileValue({
  control,
  errors,
  index,
}: VariableFileValueProps) {
  const files = useGeneratorStore((store) => store.files)
  const fileName = useWatch({
    control,
    name: `variables.${index}.file.fileName`,
  })
  const { data: preview, isLoading } = useDataFilePreview(fileName ?? '')

  const fileOptions = useMemo(
    () =>
      files.map((file) => ({
        value: file.name,
        label: <CodeLabel>{path.basename(file.name)}</CodeLabel>,
      })),
    [files]
  )

  const propOptions = useMemo(
    () =>
      (preview?.data.props ?? []).map((prop) => ({
        value: prop,
        label: <CodeLabel>{prop}</CodeLabel>,
      })),
    [preview]
  )

  return (
    <Flex gap="2" align="start">
      <FieldGroup
        name={`variables.${index}.file.fileName`}
        errors={errors}
        mb="0"
        flexGrow="1"
      >
        <ControlledSelect
          control={control}
          name={`variables.${index}.file.fileName`}
          options={fileOptions}
          selectProps={{ defaultOpen: !fileName }}
          contentProps={{ position: 'popper' }}
        />
      </FieldGroup>
      <FieldGroup
        name={`variables.${index}.file.propertyName`}
        errors={errors}
        mb="0"
        flexGrow="1"
      >
        <ControlledSelect
          control={control}
          name={`variables.${index}.file.propertyName`}
          options={propOptions}
          selectProps={{ disabled: isLoading || propOptions.length === 0 }}
          contentProps={{ position: 'popper' }}
        />
      </FieldGroup>
    </Flex>
  )
}

function CodeLabel({ children }: { children: string }) {
  return (
    <Code size="2" truncate variant="ghost">
      {children}
    </Code>
  )
}
