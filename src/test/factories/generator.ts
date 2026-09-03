import { vi } from 'vitest'

import { DEFAULT_HTTP_TIMEOUT } from '@/schemas/generator'
import { GeneratorStore } from '@/store/generator'
import { GeneratorFileData } from '@/types/generator'

export function createGeneratorData(
  data?: Partial<GeneratorFileData>
): GeneratorFileData {
  return {
    allowlist: [],
    manualRequests: [],
    groupRenames: {},
    groupOrder: [],
    includeStaticAssets: false,
    options: {
      loadProfile: {
        executor: 'ramping-vus',
        stages: [],
      },
      thinkTime: {
        sleepType: 'groups',
        timing: {
          type: 'fixed',
          value: 1,
        },
      },
      rendezvous: {},
      thresholds: [],
      httpTimeout: DEFAULT_HTTP_TIMEOUT,
      cloud: {
        loadZones: {
          distribution: 'even',
          zones: [],
        },
      },
    },
    recordingPath: '',
    excludedRequests: [],
    requestOverrides: {},
    rules: [],
    scriptName: 'script.js',
    testData: {
      variables: [],
      files: [],
    },
    version: '3.0',
    wizardUsed: false,
    ...data,
  }
}

export function createGeneratorState(
  state?: Partial<GeneratorStore>
): GeneratorStore {
  return {
    metadata: {
      requestJsonPaths: [],
      responseJsonPaths: [],
    },
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
    setHttpTimeout: vi.fn(),
    addRule: vi.fn(),
    setRules: vi.fn(),
    cloneRule: vi.fn(),
    deleteRule: vi.fn(),
    toggleEnableRule: vi.fn(),
    rules: [],
    previewOriginalRequests: false,
    swapRules: vi.fn(),
    updateRule: vi.fn(),
    setPreviewOriginalRequests: vi.fn(),

    includeStaticAssets: false,
    setIncludeStaticAssets: vi.fn(),

    scriptName: 'script.js',
    setScriptName: vi.fn(),

    wizardUsed: false,
    setWizardUsed: vi.fn(),

    recordingPath: '',
    recordingError: null,
    setRecordingPath: vi.fn(),
    setRecordingError: vi.fn(),
    setGeneratorFile: vi.fn(),
    resetGeneratorFile: vi.fn(),
    resetRecording: vi.fn(),
    setRecording: vi.fn(),

    allowlist: [],
    setAllowlist: vi.fn(),
    showAllowlistDialog: false,
    setShowAllowlistDialog: vi.fn(),

    selectedRuleId: '',
    setSelectedRuleId: vi.fn(),

    executor: 'ramping-vus',
    setExecutor: vi.fn(),

    iterations: 1,
    setIterations: vi.fn(),

    requests: [],
    manualRequests: [],
    addManualRequest: vi.fn(),
    replaceImportedRequests: vi.fn(),
    updateManualRequest: vi.fn(),
    removeManualRequest: vi.fn(),
    excludedRequests: [],
    toggleExcludedRequest: vi.fn(),
    restoreExcludedRequests: vi.fn(),
    requestOverrides: {},
    groupRenames: {},
    setRequestOverride: vi.fn(),
    clearRequestOverride: vi.fn(),
    emptyGroups: [],
    groupOrder: [],
    setGroupOrder: vi.fn(),
    addGroup: vi.fn(),
    renameGroup: vi.fn(),
    removeGroup: vi.fn(),

    sleepType: 'groups',
    setSleepType: vi.fn(),

    thinkTimeOverrides: {},
    setThinkTimeOverride: vi.fn(),

    rendezvous: {},
    toggleRendezvous: vi.fn(),

    stages: [],
    setStages: vi.fn(),

    timing: {
      type: 'fixed',
      value: 1,
    },
    setTiming: vi.fn(),

    variables: [],
    files: [],
    setVariables: vi.fn(),
    setFiles: vi.fn(),

    vus: 1,
    setVus: vi.fn(),

    thresholds: [],
    setThresholds: vi.fn(),

    loadZones: {
      distribution: 'even',
      zones: [],
    },
    setLoadZones: vi.fn(),
    setLoadProfile: vi.fn(),

    ...state,
  }
}
