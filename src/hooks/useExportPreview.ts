import { debounce } from 'lodash-es'
import { useEffect, useState } from 'react'

import {
  ExportPlan,
  buildExportPlan,
  generateJMeterScript,
  generateVUGenScript,
} from '@/codegen/export'
import {
  GeneratorStore,
  selectFilteredRequests,
  selectGeneratorData,
  useGeneratorStore,
} from '@/store/generator'
import { ProxyData } from '@/types'
import { GeneratorFileData } from '@/types/generator'

export type ExportFormat = 'jmeter' | 'vugen'

interface ExportInput {
  generator: GeneratorFileData
  recording: ProxyData[]
}

const GENERATORS: Record<ExportFormat, (input: ExportInput) => string> = {
  jmeter: generateJMeterScript,
  vugen: generateVUGenScript,
}

export type Derived<T> =
  | { valid: true; preview: T }
  | { valid: false; error: Error }

export type ExportPreview = Derived<string>

function derive<T>(
  compute: (input: ExportInput) => T,
  state: GeneratorStore
): Derived<T> {
  try {
    return {
      valid: true,
      preview: compute({
        generator: selectGeneratorData(state),
        recording: selectFilteredRequests(state),
      }),
    }
  } catch (error) {
    console.error(error)

    return {
      valid: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Mirrors `useScriptPreview` for the non-k6 targets. Lives in its own hook so
 * the k6 preview — which also feeds validation and export — stays untouched.
 *
 * `compute` must be stable across renders (module-level function or memoized).
 */
function useGeneratorDerived<T>(
  compute: (input: ExportInput) => T
): Derived<T> {
  const [state, setState] = useState<Derived<T>>(() =>
    derive(compute, useGeneratorStore.getState())
  )

  useEffect(() => {
    const update = debounce(
      (storeState: GeneratorStore) => setState(derive(compute, storeState)),
      100
    )

    setState(derive(compute, useGeneratorStore.getState()))

    return useGeneratorStore.subscribe(update)
  }, [compute])

  return state
}

export function useExportPreview(format: ExportFormat): ExportPreview {
  return useGeneratorDerived(GENERATORS[format])
}

/**
 * The structured plan behind the generated file — what the export tree renders
 * instead of making the user read XML or C.
 */
export function useExportPlan(): Derived<ExportPlan> {
  return useGeneratorDerived(buildExportPlan)
}
