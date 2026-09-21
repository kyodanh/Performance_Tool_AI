import { Button, Callout, Flex, TextField } from '@radix-ui/themes'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, CheckIcon } from 'lucide-react'
import { useState } from 'react'

import { FieldGroup } from '@/components/Form'
import { AiProviderSummary } from '@/handlers/ai/errorAnalysis/types'

export const AI_PROVIDER_QUERY_KEY = ['errorAnalysisProvider', 'status']

interface AiProviderFormProps {
  /** The provider being edited; absent to add a new one. */
  provider?: AiProviderSummary
  onDone: () => void
}

/** Adds or edits one OpenAI-compatible provider. Saving also selects it. */
export function AiProviderForm({ provider, onDone }: AiProviderFormProps) {
  const queryClient = useQueryClient()

  const [name, setName] = useState(provider?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '')
  const [model, setModel] = useState(provider?.model ?? '')
  const [apiKey, setApiKey] = useState('')

  const testConnection = useMutation({
    mutationFn: window.studio.ai.errorAnalysisTestConnection,
  })

  const saveConfig = useMutation({
    mutationFn: window.studio.ai.errorAnalysisSaveConfig,
    onSuccess: async (result) => {
      if ('error' in result) {
        return
      }
      await queryClient.invalidateQueries({ queryKey: AI_PROVIDER_QUERY_KEY })
      onDone()
    },
  })

  const input = {
    id: provider?.id,
    name,
    baseUrl,
    model,
    // Omitted apiKey tells the main process to keep the saved one.
    apiKey: apiKey || undefined,
  }

  const canTestOrSave =
    baseUrl.trim() !== '' &&
    model.trim() !== '' &&
    // A new provider needs a key; an edited one keeps its own when blank.
    (apiKey.trim() !== '' || provider !== undefined)

  return (
    <Flex direction="column">
      <FieldGroup name="name" label="Name">
        <TextField.Root
          placeholder="llm-mux, OpenAI, Ollama…"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </FieldGroup>

      <FieldGroup name="baseUrl" label="Base URL">
        <TextField.Root
          placeholder="https://api.example.com/v1"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </FieldGroup>

      <FieldGroup name="model" label="Model">
        <TextField.Root
          placeholder="gpt-4o-mini"
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
      </FieldGroup>

      <FieldGroup
        name="apiKey"
        label="API Key"
        hint={
          provider ? 'Leave blank to keep the currently saved key.' : undefined
        }
        hintType="text"
      >
        <TextField.Root
          type="password"
          placeholder={provider ? '••••••••' : 'API key'}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </FieldGroup>

      {saveConfig.data && 'error' in saveConfig.data && (
        <Callout.Root size="1" mb="4" color="red">
          <Callout.Icon>
            <AlertTriangleIcon size={16} />
          </Callout.Icon>
          <Callout.Text>{saveConfig.data.error}</Callout.Text>
        </Callout.Root>
      )}

      {testConnection.data && (
        <Callout.Root
          size="1"
          mb="4"
          color={testConnection.data.ok ? 'green' : 'red'}
        >
          <Callout.Icon>
            {testConnection.data.ok ? (
              <CheckIcon size={16} />
            ) : (
              <AlertTriangleIcon size={16} />
            )}
          </Callout.Icon>
          <Callout.Text>
            {testConnection.data.ok
              ? 'Connection successful.'
              : testConnection.data.message}
          </Callout.Text>
        </Callout.Root>
      )}

      <Flex gap="3">
        <Button
          type="button"
          variant="outline"
          loading={testConnection.isPending}
          disabled={!canTestOrSave}
          onClick={() => testConnection.mutate(input)}
        >
          Test connection
        </Button>
        <Button
          type="button"
          loading={saveConfig.isPending}
          disabled={!canTestOrSave}
          onClick={() => saveConfig.mutate(input)}
        >
          Save and use
        </Button>
        <Button type="button" variant="soft" color="gray" onClick={onDone}>
          Cancel
        </Button>
      </Flex>
    </Flex>
  )
}
