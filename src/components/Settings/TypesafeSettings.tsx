import {
  Button,
  Callout,
  Checkbox,
  Flex,
  Text,
  TextField,
} from '@radix-ui/themes'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, CircleOffIcon } from 'lucide-react'
import { useState } from 'react'

import { FieldGroup } from '@/components/Form'
import { ErrorAnalysisStatus } from '@/handlers/ai/errorAnalysis/types'

import { AI_PROVIDER_QUERY_KEY } from './AiProviderForm'

const SOURCE_LABEL = {
  settings: 'Active — using the key saved here.',
  env: 'Active — using TYPESAFE_API_KEY from the environment / .env.',
  off: 'Off — no key, or switched off. The AI Jev button is hidden.',
  unreadable:
    'The saved key can no longer be read (the app was renamed, so its keychain entry changed). Enter the key again and Save.',
}

/** TypeSafe Jev: its own "AI Jev" button, shown while enabled here. */
export function TypesafeSettings({
  typesafe,
}: {
  typesafe: ErrorAnalysisStatus['typesafe']
}) {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  // Enabled with a saved key yet no source: the key failed to decrypt.
  const unreadable = typesafe.enabled && typesafe.source === null

  const save = useMutation({
    mutationFn: window.studio.ai.errorAnalysisSaveTypesafe,
    onSuccess: async () => {
      setApiKey('')
      await queryClient.invalidateQueries({ queryKey: AI_PROVIDER_QUERY_KEY })
    },
  })

  return (
    <Flex direction="column">
      <Text size="2" weight="bold" mb="1">
        Error triage — TypeSafe Jev
      </Text>
      <Text size="2" color="gray" mb="3">
        Adds a separate &quot;AI Jev&quot; button (next to AI analysis) that
        scores the likely cause of each error (correlation, overload, server
        error…) as percentages. Untick Enabled to hide the button. Get a key at
        console.typesafe.ai. Without one saved here, TYPESAFE_API_KEY from the
        environment or .env is used.
      </Text>

      <Callout.Root
        size="1"
        mb="4"
        color={typesafe.source ? 'green' : unreadable ? 'orange' : 'gray'}
      >
        <Callout.Icon>
          {typesafe.source ? (
            <CheckIcon size={16} />
          ) : (
            <CircleOffIcon size={16} />
          )}
        </Callout.Icon>
        <Callout.Text>
          {SOURCE_LABEL[typesafe.source ?? (unreadable ? 'unreadable' : 'off')]}
        </Callout.Text>
      </Callout.Root>

      <FieldGroup
        name="typesafeApiKey"
        label="API Key"
        hint={
          typesafe.configured
            ? 'Leave blank to keep the currently saved key.'
            : undefined
        }
        hintType="text"
      >
        <TextField.Root
          type="password"
          placeholder={typesafe.configured ? '••••••••' : 'apikey_…'}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </FieldGroup>

      <Flex gap="3" align="center">
        {typesafe.configured && (
          <Text size="2" as="label">
            <Checkbox
              checked={typesafe.enabled}
              onCheckedChange={(checked) =>
                save.mutate({ enabled: checked === true })
              }
            />{' '}
            Enabled
          </Text>
        )}
        <Button
          type="button"
          loading={save.isPending}
          disabled={apiKey.trim() === ''}
          onClick={() => save.mutate({ apiKey, enabled: true })}
        >
          Save
        </Button>
        {typesafe.configured && (
          <Button
            type="button"
            variant="outline"
            color="red"
            onClick={() => save.mutate(null)}
          >
            Clear
          </Button>
        )}
      </Flex>
    </Flex>
  )
}
