import { Button, Flex, Select, Separator, Text } from '@radix-ui/themes'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { useState } from 'react'

import { AiProviderSummary } from '@/handlers/ai/errorAnalysis/types'

import { AI_PROVIDER_QUERY_KEY, AiProviderForm } from './AiProviderForm'
import { SettingsSection } from './SettingsSection'
import { TypesafeSettings } from './TypesafeSettings'

/** Select's value for "no provider": items cannot carry an empty value. */
const GRAFANA = 'grafana'

export function ErrorAnalysisProviderSettings() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery({
    queryKey: AI_PROVIDER_QUERY_KEY,
    queryFn: window.studio.ai.errorAnalysisGetStatus,
  })

  /** 'new' adds a provider; null shows no form. */
  const [editing, setEditing] = useState<AiProviderSummary | 'new' | null>(null)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: AI_PROVIDER_QUERY_KEY })

  const setActive = useMutation({
    mutationFn: window.studio.ai.errorAnalysisSetActiveProvider,
    onSuccess: refresh,
  })

  const deleteProvider = useMutation({
    mutationFn: window.studio.ai.errorAnalysisDeleteProvider,
    onSuccess: refresh,
  })

  const providers = status?.providers ?? []

  return (
    <SettingsSection>
      <Text size="2" mb="4">
        The AI that explains test runs (AI analysis) and, when picked next to
        &quot;Configure with Assistant&quot;, drives guided setup. Any
        OpenAI-compatible endpoint works (llm-mux, LiteLLM, Azure, Ollama…).
      </Text>

      <Flex align="center" gap="3" mb="4">
        <Text size="2" weight="bold">
          Active AI
        </Text>
        <Select.Root
          value={status?.activeId ?? GRAFANA}
          onValueChange={(value) =>
            setActive.mutate(value === GRAFANA ? null : value)
          }
        >
          <Select.Trigger />
          <Select.Content>
            <Select.Item value={GRAFANA}>Grafana Assistant</Select.Item>
            {providers.map((provider) => (
              <Select.Item key={provider.id} value={provider.id}>
                {provider.name} ({provider.model})
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      {providers.map((provider) => (
        <Flex key={provider.id} align="center" gap="2" mb="2">
          <Flex direction="column" flexGrow="1" minWidth="0">
            <Text size="2" weight="medium">
              {provider.name}
            </Text>
            <Text size="1" color="gray" truncate>
              {provider.baseUrl} · {provider.model}
            </Text>
          </Flex>
          <Button
            type="button"
            size="1"
            variant="ghost"
            aria-label={`Edit ${provider.name}`}
            onClick={() => setEditing(provider)}
          >
            <PencilIcon size={14} />
          </Button>
          <Button
            type="button"
            size="1"
            variant="ghost"
            color="red"
            aria-label={`Delete ${provider.name}`}
            onClick={() => deleteProvider.mutate(provider.id)}
          >
            <TrashIcon size={14} />
          </Button>
        </Flex>
      ))}

      {editing === null ? (
        <Flex mt="2">
          <Button
            type="button"
            variant="soft"
            onClick={() => setEditing('new')}
          >
            <PlusIcon size={14} />
            Add provider
          </Button>
        </Flex>
      ) : (
        <Flex direction="column" mt="3">
          <Text size="2" weight="bold" mb="2">
            {editing === 'new' ? 'New provider' : `Edit ${editing.name}`}
          </Text>
          <AiProviderForm
            // A fresh form per target, so fields never carry over.
            key={editing === 'new' ? 'new' : editing.id}
            provider={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Flex>
      )}

      <Separator size="4" my="5" />

      {status && <TypesafeSettings typesafe={status.typesafe} />}
    </SettingsSection>
  )
}
