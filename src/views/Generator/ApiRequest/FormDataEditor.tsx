import { Button, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { PaperclipIcon, Trash2Icon } from 'lucide-react'
import { useEffect } from 'react'
import {
  Control,
  UseFormRegister,
  UseFormSetValue,
  useFieldArray,
  useWatch,
} from 'react-hook-form'

import { ControlledSelect } from '@/components/Form'
import { Table } from '@/components/Table'
import { useToast } from '@/store/ui/useToast'

import { ApiRequestFormData } from './ApiRequest.utils'
import { EMPTY_FORM_FIELD, attachDataFiles } from './formData'
import { VariableSuggestField } from './VariableSuggestField'

// ponytail: the few upload types we meet; anything else goes as
// application/octet-stream. Pull in mime-types if servers start rejecting that.
const CONTENT_TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  zip: 'application/zip',
}

const TYPE_OPTIONS = [
  { label: 'Text', value: 'text' },
  { label: 'File', value: 'file' },
]

interface FormDataEditorProps {
  control: Control<ApiRequestFormData>
  register: UseFormRegister<ApiRequestFormData>
  setValue: UseFormSetValue<ApiRequestFormData>
  variableNames: string[]
}

export function FormDataEditor({
  control,
  register,
  setValue,
  variableNames,
}: FormDataEditorProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'formFields',
  })
  const values = useWatch({ control, name: 'formFields' }) ?? []
  const showToast = useToast()

  // A request imported before its file was put in Data picks it up here.
  const unattached = values
    .map(({ type, path, value, fileName }) =>
      type === 'file' && !path && value === '' ? fileName : ''
    )
    .join('\n')

  useEffect(() => {
    const names = unattached.split('\n')

    if (names.every((name) => name === '')) {
      return
    }

    let cancelled = false

    void attachDataFiles(
      names.map((fileName) => ({
        ...EMPTY_FORM_FIELD,
        type: fileName === '' ? 'text' : 'file',
        fileName,
      }))
    ).then((attached) => {
      attached.forEach(({ path }, index) => {
        if (!cancelled && path) {
          setValue(`formFields.${index}.path`, path, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [unattached, setValue])

  // Copied into the project's Data folder; the request keeps the path and the
  // script reads the file with `open()`, like a data file.
  async function handleChooseFile(index: number) {
    let filePath: string | undefined

    try {
      filePath = await window.studio.data.importUploadFile()
    } catch {
      showToast({
        title: 'Failed to add file',
        description: 'Files over 10 MB cannot be uploaded.',
        status: 'error',
      })
      return
    }

    if (filePath === undefined) {
      return
    }

    const fileName = filePath.split(/[\\/]/).pop() ?? ''
    const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
    const options = { shouldDirty: true, shouldValidate: true }

    setValue(`formFields.${index}.path`, filePath, options)
    setValue(`formFields.${index}.fileName`, fileName, options)
    setValue(`formFields.${index}.value`, '', options)
    // An imported script may already name the type the server expects.
    if (!values[index]?.contentType) {
      setValue(
        `formFields.${index}.contentType`,
        CONTENT_TYPES[extension] ?? 'application/octet-stream',
        options
      )
    }
  }

  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell width="30%">Name</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="100px">Type</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="0"></Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {fields.map((field, index) => {
          const current = values[index]

          return (
            <Table.Row key={field.id}>
              <Table.Cell>
                <TextField.Root
                  placeholder="file"
                  aria-label={`Field name ${index + 1}`}
                  {...register(`formFields.${index}.name`)}
                />
              </Table.Cell>
              <Table.Cell>
                <ControlledSelect
                  name={`formFields.${index}.type`}
                  control={control}
                  options={TYPE_OPTIONS}
                  onChange={(type) => {
                    setValue(
                      `formFields.${index}.type`,
                      type as 'text' | 'file'
                    )
                    // A text value is not file content, and vice versa.
                    setValue(`formFields.${index}.value`, '')
                    setValue(`formFields.${index}.fileName`, '')
                    setValue(`formFields.${index}.contentType`, '')
                    setValue(`formFields.${index}.path`, undefined)
                  }}
                />
              </Table.Cell>
              <Table.Cell>
                {current?.type === 'file' ? (
                  <Flex gap="2" align="center">
                    <Button
                      type="button"
                      variant="soft"
                      size="1"
                      aria-label={`Field file ${index + 1}`}
                      onClick={() => void handleChooseFile(index)}
                    >
                      <PaperclipIcon />
                      Choose file
                    </Button>
                    <Text size="1" color="gray" truncate>
                      {describeFile(current)}
                    </Text>
                  </Flex>
                ) : (
                  <VariableSuggestField
                    placeholder="value"
                    aria-label={`Field value ${index + 1}`}
                    names={variableNames}
                    onInsert={(value) =>
                      setValue(`formFields.${index}.value`, value, {
                        shouldDirty: true,
                      })
                    }
                    {...register(`formFields.${index}.value`)}
                  />
                )}
              </Table.Cell>
              <Table.Cell>
                <IconButton
                  type="button"
                  aria-label="Remove field"
                  variant="ghost"
                  color="gray"
                  onClick={() => remove(index)}
                >
                  <Trash2Icon />
                </IconButton>
              </Table.Cell>
            </Table.Row>
          )
        })}
        <Table.Row>
          <Table.RowHeaderCell colSpan={4} justify="center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => append(EMPTY_FORM_FIELD)}
            >
              Add field
            </Button>
          </Table.RowHeaderCell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  )
}

function describeFile({
  fileName,
  path,
  value,
}: {
  fileName: string
  path?: string
  value: string
}) {
  if (path) {
    return `Data/${fileName}`
  }

  // Embedded by an older version of the editor.
  if (value !== '') {
    return `${fileName} (${value.length} B, embedded)`
  }

  // An imported script names the file but can't carry it.
  return fileName ? `${fileName} — not attached` : 'No file chosen'
}
