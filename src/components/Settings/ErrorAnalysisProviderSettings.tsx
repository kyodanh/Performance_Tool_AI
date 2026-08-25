import { Button, Callout, Flex, Text, TextField } from '@radix-ui/themes'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, CheckIcon } from 'lucide-react'
import { useState } from 'react'

import { FieldGroup } from '@/components/Form'

import { SettingsSection } from './SettingsSection'

const QUERY_KEY = ['errorAnalysisProvider', 'status']

export function ErrorAnalysisProviderSettings() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: window.studio.ai.errorAnalysisGetStatus,
  })

  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
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
      setApiKey('')
      testConnection.reset()
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const clearConfig = useMutation({
    mutationFn: window.studio.ai.errorAnalysisClearConfig,
    onSuccess: async () => {
      setBaseUrl('')
      setModel('')
      setApiKey('')
      testConnection.reset()
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const effectiveBaseUrl = baseUrl || status?.baseUrl || ''
  const effectiveModel = model || status?.model || ''
  const canTestOrSave =
    effectiveBaseUrl.trim() !== '' &&
    effectiveModel.trim() !== '' &&
    // A key is required the first time; once configured, an empty field
    // means "keep the currently saved key".
    (apiKey.trim() !== '' || status?.configured)

  return (
    <SettingsSection>
      <Flex gap="2" mb="4">
        <Text size="2" as="label">
          Used by the &quot;Analyze with AI&quot; button in the Validator to
          explain test failures. Works with any OpenAI-compatible endpoint
          (self-hosted gateway, Azure, LiteLLM, Ollama, etc). This is
          independent from the Grafana Assistant.
        </Text>
      </Flex>

      {status?.configured && (
        <Callout.Root size="1" mb="4">
          <Callout.Icon>
            <CheckIcon size={16} />
          </Callout.Icon>
          <Callout.Text>
            Configured — {status.baseUrl} ({status.model})
          </Callout.Text>
        </Callout.Root>
      )}

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
          status?.configured
            ? 'Leave blank to keep the currently saved key.'
            : undefined
        }
        hintType="text"
      >
        <TextField.Root
          type="password"
          placeholder={status?.configured ? '••••••••' : 'API key'}
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
          onClick={() =>
            testConnection.mutate({
              baseUrl: effectiveBaseUrl,
              model: effectiveModel,
              apiKey: apiKey || undefined,
            })
          }
        >
          Test connection
        </Button>
        <Button
          type="button"
          loading={saveConfig.isPending}
          disabled={!canTestOrSave}
          onClick={() =>
            saveConfig.mutate({
              baseUrl: effectiveBaseUrl,
              model: effectiveModel,
              // Omitted apiKey tells the main process to keep the saved one.
              apiKey: apiKey || undefined,
            })
          }
        >
          Save
        </Button>
        {status?.configured && (
          <Button
            type="button"
            variant="outline"
            color="red"
            loading={clearConfig.isPending}
            onClick={() => clearConfig.mutate()}
          >
            Clear
          </Button>
        )}
      </Flex>
    </SettingsSection>
  )
}
