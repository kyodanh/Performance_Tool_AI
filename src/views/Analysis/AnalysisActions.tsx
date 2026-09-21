import { Button, DropdownMenu } from '@radix-ui/themes'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardCopyIcon,
  FileTextIcon,
  ScanSearchIcon,
  SparklesIcon,
} from 'lucide-react'
import { useState } from 'react'

import { AI_PROVIDER_QUERY_KEY } from '@/components/Settings/AiProviderForm'
import { AiAnalysis } from '@/components/Validator/AiAnalysis'
import {
  ExportReportButton,
  ExportVersion,
} from '@/components/Validator/ExportReportButton'
import { AnalyzeFailureRequest } from '@/handlers/ai/errorAnalysis/types'
import { useToast } from '@/store/ui/useToast'
import { buildRunMarkdown, RunMarkdownInput } from '@/utils/k6/runMarkdown'

interface AnalysisActionsProps {
  /** The capped summary the model is sent — see `buildFailureAnalysisPrompt`. */
  aiRequest: AnalyzeFailureRequest
  /** The whole run, for the clipboard. Null while none is loaded. */
  run: RunMarkdownInput | null
  testName: string
  versions: ExportVersion[]
  selectedId: string | null
}

/**
 * The header's one menu: analyze the run, copy it for a chat, or export the
 * PDF. Both dialogs live here rather than inside the menu, which unmounts its
 * items as it closes and would take an open dialog with it.
 */
export function AnalysisActions({
  aiRequest,
  run,
  testName,
  versions,
  selectedId,
}: AnalysisActionsProps) {
  const showToast = useToast()
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [jevOpen, setJevOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const { data: status } = useQuery({
    queryKey: AI_PROVIDER_QUERY_KEY,
    queryFn: window.studio.ai.errorAnalysisGetStatus,
  })

  const activeProvider = status?.providers.find(
    (provider) => provider.id === status.activeId
  )
  // Jev's item follows Settings → AI: shown only while a key is enabled.
  const jevEnabled = !!status?.typesafe.source

  const handleCopy = async () => {
    if (run === null) {
      return
    }

    try {
      await navigator.clipboard.writeText(buildRunMarkdown(run))
      showToast({ title: 'Run copied as Markdown', status: 'success' })
    } catch {
      showToast({ title: 'Failed to copy the run', status: 'error' })
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="soft" radius="full" disabled={run === null}>
            Actions
            <DropdownMenu.TriggerIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item onSelect={() => setAnalysisOpen(true)}>
            <SparklesIcon size={14} /> AI analysis (
            {activeProvider?.name ?? 'Grafana AI · k6'})
          </DropdownMenu.Item>
          {jevEnabled && (
            <DropdownMenu.Item onSelect={() => setJevOpen(true)}>
              <ScanSearchIcon size={14} /> AI Jev
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item onSelect={() => void handleCopy()}>
            <ClipboardCopyIcon size={14} /> Copy for AI
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            onSelect={() => setExportOpen(true)}
            disabled={versions.length === 0}
          >
            <FileTextIcon size={14} /> Export PDF report
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <AiAnalysis
        request={aiRequest}
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
      />
      <AiAnalysis
        engine="jev"
        request={aiRequest}
        open={jevOpen}
        onOpenChange={setJevOpen}
      />
      <ExportReportButton
        stats={run?.stats ?? null}
        testName={testName}
        isRunning={false}
        versions={versions}
        selectedId={selectedId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </>
  )
}
