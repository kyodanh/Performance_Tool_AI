import { css } from '@emotion/react'
import { Badge, Box, Flex, Tabs } from '@radix-ui/themes'
import { CircleXIcon } from 'lucide-react'
import { useState } from 'react'

import { ExportFormat } from '@/hooks/useExportPreview'
import { ScriptPreview as ScriptPreviewType } from '@/hooks/useScriptPreview'
import {
  selectFilteredRequests,
  selectHasRecording,
  useGeneratorStore,
} from '@/store/generator'
import { ProxyData } from '@/types'

import { AllowlistDialog } from '../Allowlist/AllowlistDialog'
import { TestData } from '../TestData'
import { TestOptions } from '../TestOptions'

import { ExportPreview } from './ExportPreview'
import { RequestList } from './RequestList'
import { ScriptPreview } from './ScriptPreview'

interface GeneratorTabsProps {
  script: ScriptPreviewType
  selectedRequest: ProxyData | null
  onSelectRequest: (request: ProxyData | null) => void
  onChangeRecording: (newPath: string) => void
}

export function GeneratorTabs({
  script,
  selectedRequest,
  onSelectRequest,
  onChangeRecording,
}: GeneratorTabsProps) {
  const [tab, setTab] = useState('requests')
  // Hand-edited export sources live here, not in the generator: they are one
  // target's text, nothing can parse them back into rules. Kept above the tabs
  // so switching tabs does not throw the edit away.
  const [drafts, setDrafts] = useState<Partial<Record<ExportFormat, string>>>(
    {}
  )

  function handleDraftChange(format: ExportFormat, draft: string | undefined) {
    setDrafts((current) => ({ ...current, [format]: draft }))
  }

  const filteredRequests = useGeneratorStore(selectFilteredRequests)
  const hasRecording = useGeneratorStore(selectHasRecording)

  return (
    <Flex direction="column" height="100%" minHeight="0" asChild>
      <Tabs.Root value={tab} onValueChange={(value) => setTab(value)}>
        <Box flexShrink="0">
          <Tabs.List>
            <Flex justify="between" width="100%" align="center">
              <Flex>
                <Tabs.Trigger value="requests">
                  <Flex align="center" gap="2">
                    Requests
                    <Badge color="gray" variant="soft" radius="medium">
                      {filteredRequests.length}
                    </Badge>
                  </Flex>
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="script"
                  disabled={!hasRecording}
                  css={
                    !script.valid &&
                    css`
                      color: var(--red-9);
                    `
                  }
                >
                  {!script.valid && (
                    <CircleXIcon
                      css={css`
                        margin-right: var(--space-1);
                      `}
                      color="var(--red-9)"
                    />
                  )}
                  Script (k6)
                </Tabs.Trigger>
                <Tabs.Trigger value="jmeter" disabled={!hasRecording}>
                  JMeter
                </Tabs.Trigger>
                <Tabs.Trigger value="vugen" disabled={!hasRecording}>
                  LoadRunner
                </Tabs.Trigger>
              </Flex>
              <Flex pr="2" pl="4" gap="4">
                <TestOptions />
                <TestData />
                <AllowlistDialog />
              </Flex>
            </Flex>
          </Tabs.List>
        </Box>
        <Tabs.Content
          value="requests"
          css={css`
            flex-grow: 1;
            min-height: 0;
          `}
        >
          <RequestList
            requests={filteredRequests}
            selectedRequest={selectedRequest}
            onSelectRequest={onSelectRequest}
            onChangeRecording={onChangeRecording}
          />
        </Tabs.Content>
        <Tabs.Content
          value="script"
          css={css`
            flex-grow: 1;
            min-height: 0;
          `}
        >
          <ScriptPreview script={script} />
        </Tabs.Content>
        <Tabs.Content
          value="jmeter"
          css={css`
            flex-grow: 1;
            min-height: 0;
          `}
        >
          <ExportPreview
            format="jmeter"
            draft={drafts.jmeter}
            onDraftChange={handleDraftChange}
          />
        </Tabs.Content>
        <Tabs.Content
          value="vugen"
          css={css`
            flex-grow: 1;
            min-height: 0;
          `}
        >
          <ExportPreview
            format="vugen"
            draft={drafts.vugen}
            onDraftChange={handleDraftChange}
          />
        </Tabs.Content>
      </Tabs.Root>
    </Flex>
  )
}
