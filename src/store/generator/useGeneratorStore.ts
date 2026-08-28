import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { ProxyData } from '@/types'
import { GeneratorFileData } from '@/types/generator'
import { exhaustive } from '@/utils/typescript'

import {
  createRecordingSlice,
  createRulesSlice,
  createTestDataSlice,
  createTestOptionsSlice,
  RecordingSliceStore,
  RulesSliceStore,
  TestDataStore,
  TestOptionsStore,
} from './slices'
import { createScriptDataSlice, ScriptDataStore } from './slices/script'

export interface GeneratorStore
  extends
    RecordingSliceStore,
    RulesSliceStore,
    TestDataStore,
    TestOptionsStore,
    ScriptDataStore {
  setGeneratorFile: (
    generatorFile: GeneratorFileData,
    recording?: ProxyData[]
  ) => void
  resetGeneratorFile: () => void
}

export const useGeneratorStore = create<GeneratorStore>()(
  immer((set, ...rest) => ({
    ...createRecordingSlice(set, ...rest),
    ...createRulesSlice(set, ...rest),
    ...createTestDataSlice(set, ...rest),
    ...createTestOptionsSlice(set, ...rest),
    ...createScriptDataSlice(set, ...rest),
    setGeneratorFile: ({
      options: {
        thinkTime,
        loadProfile,
        thresholds,
        cloud,
        rendezvous,
        httpTimeout,
      },
      testData: { variables, files },
      recordingPath,
      rules,
      allowlist,
      manualRequests,
      excludedRequests,
      requestOverrides,
      groupRenames,
      includeStaticAssets,
      scriptName,
      wizardUsed,
    }) =>
      set((state) => {
        state.selectedRuleId = null
        // options
        state.sleepType = thinkTime.sleepType
        state.timing = thinkTime.timing
        state.thinkTimeOverrides = thinkTime.overrides ?? {}
        state.rendezvous = rendezvous ?? {}
        state.loadZones = cloud.loadZones
        state.thresholds = thresholds
        state.httpTimeout = httpTimeout
        state.executor = loadProfile.executor
        switch (loadProfile.executor) {
          case 'ramping-vus':
            state.stages = loadProfile.stages
            break
          case 'shared-iterations':
            state.iterations = loadProfile.iterations
            state.vus = loadProfile.vus
            break
          default:
            exhaustive(loadProfile)
        }
        // data
        state.variables = variables
        state.files = files
        // recording
        state.recordingPath = recordingPath
        state.allowlist = allowlist
        state.manualRequests = manualRequests
        // Older generator files predate the field, and so does any main
        // process still running from before it existed.
        state.excludedRequests = excludedRequests ?? []
        state.requestOverrides = requestOverrides ?? {}
        state.groupRenames = groupRenames ?? {}
        state.emptyGroups = []

        state.includeStaticAssets = includeStaticAssets
        state.scriptName = scriptName
        state.wizardUsed = wizardUsed
        // rules
        state.rules = rules
        state.previewOriginalRequests = false
      }),
    resetGeneratorFile: () =>
      set(() => {
        return useGeneratorStore.getInitialState()
      }),
  }))
)
