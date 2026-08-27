import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Code,
  Flex,
  IconButton,
  TextField,
  Text,
  Tooltip,
} from '@radix-ui/themes'
import { Trash2Icon } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import {
  useForm,
  useFieldArray,
  Control,
  FieldArrayWithId,
  UseFormRegister,
  FieldErrors,
  UseFieldArrayRemove,
} from 'react-hook-form'

import { FieldGroup } from '@/components/Form'
import { Table } from '@/components/Table'
import { TestDataSchema } from '@/schemas/generator'
import { useGeneratorStore } from '@/store/generator'
import { TestData } from '@/types/testData'

import { VariableFileValue } from './VariableFileValue'

export function VariablesEditor() {
  const variables = useGeneratorStore((store) => store.variables)
  const setVariables = useGeneratorStore((store) => store.setVariables)
  const dataFiles = useGeneratorStore((store) => store.files)

  const {
    handleSubmit,
    register,
    control,
    watch,
    formState: { errors },
  } = useForm<Pick<TestData, 'variables'>>({
    resolver: zodResolver(TestDataSchema.pick({ variables: true })),
    shouldFocusError: false,
    defaultValues: { variables },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'variables',
  })

  const watchVariables = watch('variables')

  const onSubmit = useCallback(
    (data: Pick<TestData, 'variables'>) => {
      setVariables(data.variables)
    },
    [setVariables]
  )

  // Submit onChange
  useEffect(() => {
    const subscription = watch(() => handleSubmit(onSubmit)())
    return () => subscription.unsubscribe()
  }, [watch, handleSubmit, onSubmit])

  function handleAddVariable() {
    append({ name: `variable_${watchVariables.length}`, value: '' })
  }

  function handleAddFileVariable() {
    append({
      name: `variable_${watchVariables.length}`,
      value: '',
      file: { fileName: dataFiles[0]?.name ?? '', propertyName: '' },
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Text size="2" as="p" mb="2">
        Define variables and use them in your test rules, or inline in any text
        value with <Code size="1">{'${name}'}</Code>.
      </Text>
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell width="30%">Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="0"></Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {fields.map((field, index) => (
            <VariableRow
              key={field.id}
              field={field}
              index={index}
              control={control}
              register={register}
              errors={errors}
              onRemove={remove}
            />
          ))}
          <Table.Row>
            <Table.RowHeaderCell colSpan={3} justify="center">
              <Flex gap="4" justify="center">
                <Button variant="ghost" onClick={handleAddVariable}>
                  Add variable
                </Button>
                <Tooltip
                  content="Add a data file in the Data files tab first"
                  hidden={dataFiles.length > 0}
                >
                  <Button
                    variant="ghost"
                    disabled={dataFiles.length === 0}
                    onClick={handleAddFileVariable}
                  >
                    Add variable from file
                  </Button>
                </Tooltip>
              </Flex>
            </Table.RowHeaderCell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    </form>
  )
}

interface VariableRowProps {
  field: FieldArrayWithId<Pick<TestData, 'variables'>, 'variables', 'id'>
  index: number
  control: Control<Pick<TestData, 'variables'>>
  register: UseFormRegister<Pick<TestData, 'variables'>>
  errors: FieldErrors<Pick<TestData, 'variables'>>
  onRemove: UseFieldArrayRemove
}

function VariableRow({
  field,
  index,
  control,
  errors,
  register,
  onRemove,
}: VariableRowProps) {
  const isVariableInUse = useGeneratorStore((state) =>
    state.rules.some(
      (rule) =>
        rule.type === 'parameterization' &&
        rule.value.type === 'variable' &&
        rule.value.variableName === field.name
    )
  )

  return (
    <Table.Row>
      <Table.Cell maxWidth="400px">
        <FieldGroup errors={errors} name={`variables.${index}.name`} mb="0">
          <TextField.Root
            placeholder="name"
            disabled={isVariableInUse}
            {...register(`variables.${index}.name`)}
          />
        </FieldGroup>
      </Table.Cell>
      <Table.Cell>
        {field.file ? (
          <VariableFileValue control={control} errors={errors} index={index} />
        ) : (
          <FieldGroup errors={errors} name={`variables.${index}.value`} mb="0">
            <TextField.Root
              placeholder="value"
              {...register(`variables.${index}.value`)}
            />
          </FieldGroup>
        )}
      </Table.Cell>
      <Table.Cell>
        <Tooltip
          content="Variable is referenced in a rule"
          hidden={!isVariableInUse}
        >
          <IconButton
            aria-label="Remove"
            disabled={isVariableInUse}
            onClick={() => onRemove(index)}
          >
            <Trash2Icon />
          </IconButton>
        </Tooltip>
      </Table.Cell>
    </Table.Row>
  )
}
