import {
  Box,
  Button,
  Code,
  Flex,
  IconButton,
  Text,
  TextField,
} from '@radix-ui/themes'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useFieldArray, useFormContext } from 'react-hook-form'

import { FieldGroup } from '@/components/Form'
import { TestRule } from '@/types/rules'

const findHint = (
  <Text size="1">
    Exact match against the raw request, which is not pretty-printed the way the
    payload view shows it - write <Code size="1">{'"id":2'}</Code>, not{' '}
    <Code size="1">{'"id": 2'}</Code>.
  </Text>
)

const replaceHint = (
  <Text size="1">
    Optional. <Code size="1">{'{}'}</Code> - or the variable name as{' '}
    <Code size="1">{'{name}'}</Code> - is where the extracted value goes, so{' '}
    <Code size="1">{'"id":{}'}</Code> keeps the key and its quoting. Leave empty
    to replace the whole match.
  </Text>
)

/**
 * The selector's find/replace pairs. One extracted value tends to appear under
 * several keys (`"id":7`, `"excludeExamId":7`), and a rule per key would
 * extract the same value again for each of them, so the pairs live on one rule.
 *
 * The first pair is the selector's own `value`/`replaceWith` and stays put;
 * `replacements` holds the ones added here, which keeps generator files saved
 * before this readable as a single-pair selector.
 */
export function TextReplacements({ field }: { field: 'replacer.selector' }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<TestRule>()

  const { fields, append, remove } = useFieldArray({
    control,
    name: `${field}.replacements`,
  })

  return (
    <>
      <FieldGroup
        name={`${field}.value`}
        errors={errors}
        label="Find"
        hint={findHint}
      >
        <TextField.Root
          placeholder={'e.g. "id":2'}
          {...register(`${field}.value`)}
        />
      </FieldGroup>
      <FieldGroup
        name={`${field}.replaceWith`}
        errors={errors}
        label="Replace with"
        hint={replaceHint}
      >
        <TextField.Root
          placeholder={'e.g. "id":{}'}
          {...register(`${field}.replaceWith`)}
        />
      </FieldGroup>

      {fields.map((item, index) => (
        <Flex key={item.id} gap="2" align="end" mb="2">
          <Box flexGrow="1">
            <FieldGroup
              name={`${field}.replacements.${index}.value`}
              errors={errors}
              label="Find"
              mb="0"
            >
              <TextField.Root
                placeholder={'e.g. "excludeExamId":7'}
                aria-label={`Find ${index + 2}`}
                {...register(`${field}.replacements.${index}.value`)}
              />
            </FieldGroup>
          </Box>
          <Box flexGrow="1">
            <FieldGroup
              name={`${field}.replacements.${index}.replaceWith`}
              errors={errors}
              label="Replace with"
              mb="0"
            >
              <TextField.Root
                placeholder={'e.g. "excludeExamId":{}'}
                aria-label={`Replace with ${index + 2}`}
                {...register(`${field}.replacements.${index}.replaceWith`)}
              />
            </FieldGroup>
          </Box>
          <IconButton
            type="button"
            aria-label={`Remove replacement ${index + 2}`}
            variant="ghost"
            color="gray"
            mb="2"
            onClick={() => remove(index)}
          >
            <Trash2Icon />
          </IconButton>
        </Flex>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="1"
        mb="2"
        onClick={() => append({ value: '', replaceWith: '' })}
      >
        <PlusIcon />
        Add another
      </Button>
    </>
  )
}
