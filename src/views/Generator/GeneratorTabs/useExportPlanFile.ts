import { useCallback } from 'react'

import { useSaveFile } from '@/hooks/useSaveFile'
import { useGeneratorStore } from '@/store/generator'
import { useToast } from '@/store/ui/useToast'
import * as path from '@/utils/path'

const FILTERS: Record<string, { name: string; extensions: string[] }> = {
  jmx: { name: 'JMeter test plan', extensions: ['jmx'] },
  c: { name: 'VuGen action', extensions: ['c'] },
}

interface UseExportPlanFileOptions {
  extension: string
  content: string
}

/**
 * Writes the generated JMeter / LoadRunner file wherever the user picks. Unlike
 * `useExportScript` it registers no menu item — the k6 script owns Export.
 */
export function useExportPlanFile({
  extension,
  content,
}: UseExportPlanFileOptions) {
  const showToast = useToast()
  const scriptName = useGeneratorStore((store) => store.scriptName)
  const baseName = path.basename(scriptName).replace(/\.[^.]+$/, '')

  const saveFile = useSaveFile({
    location: { type: 'untitled', hint: `${baseName}.${extension}` },
    content: () => ({
      type: 'script',
      data: content,
      isExternal: false,
      options: {},
    }),
    filters: [FILTERS[extension] ?? { name: 'File', extensions: [extension] }],
    onSave({ location }) {
      showToast({
        title: `Exported to ${path.basename(location.path)}`,
        status: 'success',
      })
    },
    onError(error) {
      showToast({
        title: 'Failed to export the file.',
        status: 'error',
        description: error.message,
      })
    },
  })

  return useCallback(() => saveFile({ saveAs: false }), [saveFile])
}
