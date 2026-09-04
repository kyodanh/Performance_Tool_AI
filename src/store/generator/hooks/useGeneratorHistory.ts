import { useCallback, useEffect, useRef } from 'react'

import { EditAction } from '@/handlers/ui/types'
import { selectGeneratorData, useGeneratorStore } from '@/store/generator'
import { GeneratorFileData } from '@/types/generator'

// Text fields write a snapshot per keystroke, so the stack has to be capped.
const MAX_HISTORY = 100

/**
 * Undo/redo for the generator, as snapshots of the data that gets saved to the
 * file - every edit is covered without each action having to describe how to
 * reverse itself. Requests are not part of it: they come from the recording,
 * which is reloaded from `recordingPath` when a snapshot is restored.
 *
 * Call it *after* the effect that loads the file, so the load itself is dropped
 * from the history rather than becoming something to undo into.
 */
export function useGeneratorHistory(loadedData: GeneratorFileData) {
  const setGeneratorFile = useGeneratorStore((store) => store.setGeneratorFile)

  const past = useRef<GeneratorFileData[]>([])
  const future = useRef<GeneratorFileData[]>([])
  // What the store held at the last snapshot, and its serialized form, so a
  // change can be detected without deep comparing twice.
  const current = useRef(selectGeneratorData(useGeneratorStore.getState()))
  const currentJson = useRef(JSON.stringify(current.current))
  const isRestoring = useRef(false)

  useEffect(() => {
    return useGeneratorStore.subscribe((state) => {
      const data = selectGeneratorData(state)
      const json = JSON.stringify(data)

      if (json === currentJson.current) {
        return
      }

      // A restore is not an edit - it only moves the baseline.
      if (!isRestoring.current) {
        past.current = [...past.current, current.current].slice(-MAX_HISTORY)
        future.current = []
      }

      current.current = data
      currentJson.current = json
    })
  }, [])

  // A freshly loaded file starts from scratch, otherwise undo would walk back
  // into the generator that was open before it.
  useEffect(() => {
    past.current = []
    future.current = []
    current.current = selectGeneratorData(useGeneratorStore.getState())
    currentJson.current = JSON.stringify(current.current)
  }, [loadedData])

  const restore = useCallback(
    (data: GeneratorFileData) => {
      isRestoring.current = true
      setGeneratorFile(data)
      isRestoring.current = false
    },
    [setGeneratorFile]
  )

  return useCallback(
    (action: EditAction) => {
      const stack = action === 'undo' ? past : future
      const target = stack.current.at(-1)

      if (target === undefined) {
        return false
      }

      stack.current = stack.current.slice(0, -1)
      const other = action === 'undo' ? future : past
      other.current = [...other.current, current.current]

      restore(target)

      return true
    },
    [restore]
  )
}
