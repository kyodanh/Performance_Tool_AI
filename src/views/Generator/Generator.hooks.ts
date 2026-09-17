import { useMutation, useQuery } from '@tanstack/react-query'
import log from 'electron-log/renderer'
import { useMemo } from 'react'

import { useDefaultLayout } from '@/components/primitives/ResizablePanel'
import { useExportScript } from '@/hooks/useExportScript'
import { selectGeneratorData, useGeneratorStore } from '@/store/generator'
import { useToast } from '@/store/ui/useToast'
import { GeneratorFileData } from '@/types/generator'
import * as path from '@/utils/path'

import {
  generateScriptFromGenerator,
  loadGeneratorFile,
  loadHarFile,
} from './Generator.utils'

export function useGeneratorLayout() {
  const mainLayout = useDefaultLayout({
    id: 'generator-main',
  })

  const sidebarLayout = useDefaultLayout({
    id: 'generator-sidebar',
  })

  const detailsLayout = useDefaultLayout({
    id: 'generator-details',
  })

  return {
    mainLayout,
    sidebarLayout,
    detailsLayout,
  }
}

export function useLoadHarFile(filePath?: string) {
  return useQuery({
    queryKey: ['har', filePath],
    enabled: !!filePath,
    queryFn: () => loadHarFile(filePath!),
    gcTime: 0,
    staleTime: 0,
  })
}

export function useUpdateValueInGeneratorFile(filePath: string) {
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { data: generator } = await loadGeneratorFile(filePath)

      await window.studio.generator.saveGenerator(
        { ...generator, [key]: value },
        filePath
      )
    },
  })
}

export function useIsGeneratorDirty(savedData: GeneratorFileData) {
  const savedJson = useMemo(
    () => serializeGeneratorData(savedData),
    [savedData]
  )

  // The comparison happens inside the selector so this hook yields a boolean.
  // `selectGeneratorData` assembles a new object on every call - `options` and
  // `testData` included - so returning it (shallow-compared or not) re-rendered
  // the whole generator on every store write, keystrokes in the rule editor
  // included. A boolean compares by value, so only a real change re-renders.
  return useGeneratorStore(
    (state) => serializeGeneratorData(selectGeneratorData(state)) !== savedJson
  )
}

/**
 * JSON rather than a deep equal, to drop `property: undefined` values.
 * `scriptName` is left out: it is saved to disk in the background, so it is not
 * an edit the user has to be warned about.
 */
function serializeGeneratorData({ scriptName: _, ...data }: GeneratorFileData) {
  // An empty `disabledRequests` is dropped: files saved before the field - or
  // read by a main process built before it - lack it, and would otherwise
  // open as unsaved and block every navigation away.
  return JSON.stringify(data, (key, value: unknown) =>
    key === 'disabledRequests' && Array.isArray(value) && value.length === 0
      ? undefined
      : value
  )
}

export function useScriptExport(generatorFilePath: string) {
  const showToast = useToast()

  const scriptName = useGeneratorStore((store) => store.scriptName)
  const setScriptName = useGeneratorStore((store) => store.setScriptName)

  const { mutateAsync: updateGeneratorFile } =
    useUpdateValueInGeneratorFile(generatorFilePath)

  return useExportScript({
    fileName: scriptName,
    content: (filePath) => {
      return generateScriptFromGenerator(filePath)
    },
    async onSuccess(location) {
      const savedScriptName = path.basename(location.path)

      setScriptName(savedScriptName)

      try {
        await updateGeneratorFile({ key: 'scriptName', value: savedScriptName })
      } catch (error) {
        log.error(error)

        showToast({
          title: 'Failed to update script name',
          status: 'error',
        })
      }
    },
  })
}
