import { Flex } from '@radix-ui/themes'
import { useEffect, useState } from 'react'

import { ReactMonacoEditor } from '@/components/Monaco/ReactMonacoEditor'
import { ScriptPreview as ScriptPreviewType } from '@/hooks/useScriptPreview'
import { useTrackScriptCopy } from '@/hooks/useTrackScriptCopy'
import { prettify } from '@/utils/prettify'

import { ScriptPreviewError } from './ScriptPreviewError'

interface ScriptPreviewProps {
  script: ScriptPreviewType
}

export function ScriptPreview({ script }: ScriptPreviewProps) {
  const raw = script.valid ? script.preview : ''
  const error = script.valid ? undefined : script.error
  const preview = useFormatted(raw)

  const handleCopy = useTrackScriptCopy(preview, 'generator')

  return (
    <Flex direction="column" height="100%" position="relative">
      <ReactMonacoEditor
        showToolbar
        defaultLanguage="javascript"
        options={{
          readOnly: true,
        }}
        value={preview}
        onCopy={handleCopy}
      />

      {!!error && <ScriptPreviewError error={error} />}
    </Flex>
  )
}

/**
 * Formatting is done here rather than where the script is generated: this tab
 * is the only place a human reads it, and it is unmounted the rest of the time.
 */
function useFormatted(raw: string) {
  const [formatted, setFormatted] = useState(raw)

  useEffect(() => {
    let current = true

    prettify(raw)
      .then((result) => {
        if (current) {
          setFormatted(result)
        }
      })
      // Unformatted is still readable, and a broken script already shows the
      // generation error.
      .catch(() => {
        if (current) {
          setFormatted(raw)
        }
      })

    return () => {
      current = false
    }
  }, [raw])

  return formatted
}
