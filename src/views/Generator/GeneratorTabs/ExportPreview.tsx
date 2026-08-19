import { Flex } from '@radix-ui/themes'

import { ReactMonacoEditor } from '@/components/Monaco/ReactMonacoEditor'
import { ExportFormat, useExportPreview } from '@/hooks/useExportPreview'

import { ScriptPreviewError } from './ScriptPreviewError'

const LANGUAGES: Record<ExportFormat, string> = {
  jmeter: 'xml',
  vugen: 'cpp',
}

interface ExportPreviewProps {
  format: ExportFormat
}

export function ExportPreview({ format }: ExportPreviewProps) {
  const script = useExportPreview(format)

  return (
    <Flex direction="column" height="100%" position="relative">
      <ReactMonacoEditor
        showToolbar
        language={LANGUAGES[format]}
        options={{ readOnly: true }}
        value={script.valid ? script.preview : ''}
      />

      {!script.valid && <ScriptPreviewError error={script.error} />}
    </Flex>
  )
}
