import { css } from '@emotion/react'
import { Box, Button, Callout, Dialog, Flex, Spinner } from '@radix-ui/themes'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, SparklesIcon } from 'lucide-react'
import { useState } from 'react'

import { SimpleMarkdown } from '@/components/Assistant/SimpleMarkdown'
import { AnalyzeFailureRequest } from '@/handlers/ai/errorAnalysis/types'
import { useAssistantAuthStatus } from '@/hooks/useAssistantAuth'
import { useStudioUIStore } from '@/store/ui'

interface AiAnalysisProps {
  /**
   * Built on every render, but only sent on click. Failures in it steer the
   * model towards a root-cause analysis; without them it reviews performance.
   */
  request: AnalyzeFailureRequest
}

/**
 * Sits next to the run's tabs: one click analyzes the run and shows the answer
 * in a dialog, so the reader never leaves the tab they were looking at.
 */
export function AiAnalysis({ request }: AiAnalysisProps) {
  const [open, setOpen] = useState(false)

  const { data: status } = useQuery({
    queryKey: ['errorAnalysisProvider', 'status'],
    queryFn: window.studio.ai.errorAnalysisGetStatus,
  })

  // The analysis runs on the Grafana Assistant unless a custom provider is
  // saved, so either one is enough to offer the button.
  const { data: assistant } = useAssistantAuthStatus()

  const openSettingsDialog = useStudioUIStore(
    (state) => state.openSettingsDialog
  )

  const analyze = useMutation({
    mutationFn: window.studio.ai.errorAnalysisAnalyzeFailure,
  })

  const configured = status?.configured || assistant?.authenticated
  const result = analyze.data

  const handleClick = () => {
    // Without a provider there is nothing to call — send them to settings.
    if (!configured) {
      openSettingsDialog('aiProvider')

      return
    }

    setOpen(true)
    analyze.mutate(request)
  }

  return (
    <>
      <Button
        type="button"
        size="2"
        variant="soft"
        radius="full"
        loading={analyze.isPending}
        onClick={handleClick}
      >
        <SparklesIcon size={14} />
        AI analysis
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content maxWidth="800px" width="90vw">
          <Dialog.Title size="4">
            <Flex align="center" gap="2">
              <SparklesIcon size={16} />
              AI analysis
            </Flex>
          </Dialog.Title>
          <Box
            css={css`
              max-height: 60vh;
              overflow: auto;
            `}
          >
            {analyze.isPending && (
              <Flex align="center" gap="2" py="4">
                <Spinner />
                Analyzing this run…
              </Flex>
            )}

            {result && 'error' in result && (
              <Callout.Root size="1" color="red">
                <Callout.Icon>
                  <AlertTriangleIcon size={16} />
                </Callout.Icon>
                <Callout.Text>{result.error}</Callout.Text>
              </Callout.Root>
            )}

            {!analyze.isPending && result && 'text' in result && (
              <SimpleMarkdown text={result.text} />
            )}
          </Box>
          <Flex justify="end" mt="3">
            <Dialog.Close>
              <Button variant="soft">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}
