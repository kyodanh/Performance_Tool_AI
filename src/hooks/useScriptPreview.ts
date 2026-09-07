import { debounce } from 'lodash-es'
import { useEffect, useState } from 'react'

import { generateScript } from '@/codegen'
import {
  selectFilteredRequests,
  selectGeneratorData,
  useGeneratorStore,
  GeneratorStore,
} from '@/store/generator'
import * as path from '@/utils/path'

export type ScriptPreview =
  | { valid: true; preview: string }
  | { valid: false; error: Error }

export function useScriptPreview(generatorPath: string): ScriptPreview {
  const [state, setState] = useState<ScriptPreview>({
    valid: true,
    preview: '',
  })

  // Connect to the store on mount, disconnect on unmount, regenerate preview on state change
  useEffect(() => {
    const scriptPath = generatorPathToScriptPath(generatorPath)

    const updatePreview = debounce((storeState: GeneratorStore) => {
      try {
        const generator = selectGeneratorData(storeState)
        const requests = selectFilteredRequests(storeState)

        // Deliberately not prettified: this runs on every store write, and
        // formatting a script this size costs more than generating it. The
        // script tab formats what it shows, and it is the only thing that
        // needs it - saving and exporting go through
        // `generateScriptFromGenerator`.
        const preview = generateScript({
          generator,
          recording: requests,
          scriptPath,
        })

        setState({ valid: true, preview })
      } catch (error) {
        console.error(error)

        setState({
          valid: false,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    }, 100)

    updatePreview(useGeneratorStore.getState())

    const unsubscribe = useGeneratorStore.subscribe((state) =>
      updatePreview(state)
    )
    return unsubscribe
  }, [generatorPath])

  return state
}

function generatorPathToScriptPath(generatorPath: string) {
  const { dir, name } = path.parse(generatorPath)
  return path.join(dir, `${name}.js`)
}
