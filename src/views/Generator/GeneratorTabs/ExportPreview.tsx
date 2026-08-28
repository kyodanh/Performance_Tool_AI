import { css } from '@emotion/react'
import { Badge, Button, Flex, SegmentedControl, Text } from '@radix-ui/themes'
import { DownloadIcon, FileInputIcon, RotateCcwIcon } from 'lucide-react'
import { useState } from 'react'

import { ReactMonacoEditor } from '@/components/Monaco/ReactMonacoEditor'
import {
  ExportFormat,
  useExportPlan,
  useExportPreview,
} from '@/hooks/useExportPreview'
import { useSettings } from '@/hooks/useSettings'

import { ImportVuGenDialog } from '../ApiRequest'

import { ExportPlanTree } from './ExportPlanTree'
import { ScriptPreviewError } from './ScriptPreviewError'
import { useExportPlanFile } from './useExportPlanFile'

const FORMATS = {
  jmeter: { language: 'xml', extension: 'jmx', source: 'XML' },
  vugen: { language: 'cpp', extension: 'c', source: 'C' },
} as const satisfies Record<
  ExportFormat,
  { language: string; extension: string; source: string }
>

interface ExportPreviewProps {
  format: ExportFormat
  /** Hand-edited source, kept by the parent so it survives tab switches. */
  draft: string | undefined
  onDraftChange: (format: ExportFormat, draft: string | undefined) => void
}

export function ExportPreview({
  format,
  draft,
  onDraftChange,
}: ExportPreviewProps) {
  const [view, setView] = useState('tree')
  const [isImporting, setIsImporting] = useState(false)
  const script = useExportPreview(format)
  const plan = useExportPlan()
  const { data: settings } = useSettings()
  const { extension, language, source } = FORMATS[format]
  const editable = settings?.script.allowExportEdit === true

  const generated = script.valid ? script.preview : ''
  const content = draft ?? generated

  const exportFile = useExportPlanFile({ extension, content })

  return (
    <Flex direction="column" height="100%" position="relative">
      <Flex
        align="center"
        justify="between"
        gap="2"
        p="2"
        css={css`
          border-bottom: 1px solid var(--gray-4);
        `}
      >
        <Flex align="center" gap="3">
          <SegmentedControl.Root
            size="1"
            value={view}
            onValueChange={(value) => setView(value)}
          >
            <SegmentedControl.Item value="tree">Overview</SegmentedControl.Item>
            <SegmentedControl.Item value="source">
              {source}
            </SegmentedControl.Item>
          </SegmentedControl.Root>

          {draft !== undefined && (
            <Flex align="center" gap="2">
              <Badge color="amber" size="1">
                Edited by hand — no longer follows the rules
              </Badge>
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => onDraftChange(format, undefined)}
              >
                <RotateCcwIcon size={14} />
                Reset
              </Button>
            </Flex>
          )}
        </Flex>

        <Flex align="center" gap="3">
          {view === 'source' && !editable && (
            <Text size="1" color="gray">
              Read-only — enable editing in Settings → Script.
            </Text>
          )}
          {format === 'vugen' && (
            <Button
              size="1"
              variant="soft"
              color="gray"
              onClick={() => setIsImporting(true)}
            >
              <FileInputIcon size={14} />
              Import as requests
            </Button>
          )}
          <Button
            size="1"
            variant="soft"
            disabled={!script.valid}
            onClick={() => void exportFile()}
          >
            <DownloadIcon size={14} />
            Export .{extension}
          </Button>
        </Flex>
      </Flex>

      <Flex direction="column" flexGrow="1" minHeight="0">
        {view === 'tree' && plan.valid && (
          <ExportPlanTree
            plan={plan.preview}
            format={format}
            editable={editable}
          />
        )}

        {view === 'source' && (
          <ReactMonacoEditor
            showToolbar
            language={language}
            options={{ readOnly: !editable }}
            value={content}
            onChange={(value) => onDraftChange(format, value ?? '')}
          />
        )}
      </Flex>

      {/* Mounted only while open so it picks up the source as it is now. */}
      {isImporting && (
        <ImportVuGenDialog
          open
          onOpenChange={setIsImporting}
          initialSource={content}
          onImported={() => onDraftChange(format, undefined)}
        />
      )}

      {!script.valid && <ScriptPreviewError error={script.error} />}
    </Flex>
  )
}
