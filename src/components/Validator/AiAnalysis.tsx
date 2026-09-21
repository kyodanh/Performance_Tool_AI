import { css } from '@emotion/react'
import { Button, Dialog } from '@radix-ui/themes'
import { useMutation, useQuery } from '@tanstack/react-query'
import { SparklesIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AssistantAuthGate } from '@/components/Assistant/AssistantAuthGate'
import {
  AnalysisEngine,
  AnalyzeFailureRequest,
} from '@/handlers/ai/errorAnalysis/types'
import { useAssistantAuthStatus } from '@/hooks/useAssistantAuth'
import { useStudioUIStore } from '@/store/ui'

import { AiAnalysisReport } from './AiAnalysisReport/AiAnalysisReport'

interface AiAnalysisProps {
  /**
   * Built on every render, but only sent on click. Failures in it steer the
   * model towards a root-cause analysis; without them it reviews performance.
   */
  request: AnalyzeFailureRequest
  /**
   * Opened from outside — by a menu item, which cannot host the dialog itself
   * because the menu unmounts as it closes. The built-in button is then left
   * out and opening starts the analysis.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** 'jev' runs TypeSafe Jev alone; its button hides until Settings enables it. */
  engine?: AnalysisEngine
}

const TITLE: Record<AnalysisEngine, string> = {
  ai: 'AI analysis',
  jev: 'AI Jev',
}

/**
 * Sits next to the run's tabs: one click analyzes the run and shows the answer
 * in a dialog, so the reader never leaves the tab they were looking at.
 */
export function AiAnalysis({
  request,
  open: openProp,
  onOpenChange,
  engine = 'ai',
}: AiAnalysisProps) {
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = openProp !== undefined
  const open = openProp ?? ownOpen
  const setOpen = onOpenChange ?? setOwnOpen

  const { data: status } = useQuery({
    queryKey: ['errorAnalysisProvider', 'status'],
    queryFn: window.studio.ai.errorAnalysisGetStatus,
  })

  // AI runs on the Grafana Assistant unless a custom provider is saved; Jev
  // needs only its own key.
  const { data: assistant } = useAssistantAuthStatus()

  const openSettingsDialog = useStudioUIStore(
    (state) => state.openSettingsDialog
  )

  const analyze = useMutation({
    mutationFn: window.studio.ai.errorAnalysisAnalyzeFailure,
  })

  const configured =
    engine === 'jev'
      ? !!status?.typesafe.source
      : status?.configured || assistant?.authenticated
  const result = analyze.data

  // Jev has nothing to sign into — its key lives in Settings. Grafana AI
  // signs in right inside the dialog instead (see AssistantAuthGate below).
  const needsSettings = engine === 'jev' && status !== undefined && !configured

  const handleClick = () => {
    if (needsSettings) {
      openSettingsDialog('aiProvider')

      return
    }

    setOpen(true)
  }

  // One place starts the run: on opening once configured, or the moment the
  // sign-in inside the dialog completes. Opening from outside (a menu item)
  // lands here too.
  useEffect(() => {
    if (!open) {
      return
    }

    if (needsSettings) {
      openSettingsDialog('aiProvider')
      setOpen(false)

      return
    }

    if (configured) {
      analyze.mutate({ request, engine })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, configured])

  return (
    <>
      {!controlled && (engine === 'ai' || configured) && (
        <Button
          type="button"
          size="2"
          variant="soft"
          radius="full"
          loading={analyze.isPending}
          onClick={handleClick}
        >
          <SparklesIcon size={14} />
          {TITLE[engine]}
        </Button>
      )}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content
          maxWidth="1080px"
          width="90vw"
          aria-describedby={undefined}
          css={css`
            padding: 0;
            max-height: 88vh;
            display: flex;
            flex-direction: column;
          `}
        >
          <AiAnalysisReport
            title={TITLE[engine]}
            request={request}
            result={result}
            pending={analyze.isPending}
          >
            {engine === 'ai' && !configured && (
              <AssistantAuthGate>{null}</AssistantAuthGate>
            )}
          </AiAnalysisReport>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}
