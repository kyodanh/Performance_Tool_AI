import { Button, IconButton, TextField } from '@radix-ui/themes'
import { Trash2Icon } from 'lucide-react'
import { Control, UseFormRegister, useFieldArray } from 'react-hook-form'

import { Table } from '@/components/Table'

import { ApiRequestFormData } from './ApiRequest.utils'

interface HeadersEditorProps {
  control: Control<ApiRequestFormData>
  register: UseFormRegister<ApiRequestFormData>
}

export function HeadersEditor({ control, register }: HeadersEditorProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'headers',
  })

  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell width="40%">Name</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="0"></Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {fields.map((field, index) => (
          <Table.Row key={field.id}>
            <Table.Cell>
              <TextField.Root
                placeholder="Content-Type"
                aria-label={`Header name ${index + 1}`}
                {...register(`headers.${index}.name`)}
              />
            </Table.Cell>
            <Table.Cell>
              <TextField.Root
                placeholder="application/json"
                aria-label={`Header value ${index + 1}`}
                {...register(`headers.${index}.value`)}
              />
            </Table.Cell>
            <Table.Cell>
              <IconButton
                type="button"
                aria-label="Remove header"
                variant="ghost"
                color="gray"
                onClick={() => remove(index)}
              >
                <Trash2Icon />
              </IconButton>
            </Table.Cell>
          </Table.Row>
        ))}
        <Table.Row>
          <Table.RowHeaderCell colSpan={3} justify="center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => append({ name: '', value: '' })}
            >
              Add header
            </Button>
          </Table.RowHeaderCell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  )
}
