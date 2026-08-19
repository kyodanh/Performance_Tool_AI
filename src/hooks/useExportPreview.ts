import { debounce } from 'lodash-es'
import { useEffect, useState } from 'react'

import { generateJMeterScript, generateVUGenScript } from '@/codegen/export'
import {
  GeneratorStore,
  selectFilteredRequests,
  selectGeneratorData,
  useGeneratorStore,
} from '@/store/generator'

export type ExportFormat = 'jmeter' | 'vugen'

const GENERATORS = {
  jmeter: generateJMeterScript,
  vugen: generateVUGenScript,
} as const

export type ExportPreview =
  | { valid: true; preview: string }
  | { valid: false; error: Error }

/**
 * Mirrors `useScriptPreview` for the non-k6 targets. Lives in its own hook so
 * the k6 preview — which also feeds validation and export — stays untouched.
 */
export function useExportPreview(format: ExportFormat): ExportPreview {
  const [state, setState] = useState<ExportPreview>({
    valid: true,
    preview: '',
  })

  useEffect(() => {
    const updatePreview = debounce((storeState: GeneratorStore) => {
      try {
        setState({
          valid: true,
          preview: GENERATORS[format]({
            generator: selectGeneratorData(storeState),
            recording: selectFilteredRequests(storeState),
          }),
        })
      } catch (error) {
        console.error(error)

        setState({
          valid: false,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    }, 100)

    updatePreview(useGeneratorStore.getState())

    return useGeneratorStore.subscribe((state) => updatePreview(state))
  }, [format])

  return state
}
