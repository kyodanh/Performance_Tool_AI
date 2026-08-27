import { DEFAULT_HTTP_TIMEOUT } from '@/schemas/generator'
import { GeneratorFileData } from '@/types/generator'
import { RampingStage } from '@/types/testOptions'
import { newSyntheticKey } from '@/utils/zod'

import { createEmptyRule } from './rules'

export function createNewGeneratorFile(
  recordingPath = '',
  httpTimeout = DEFAULT_HTTP_TIMEOUT
): GeneratorFileData {
  return {
    version: '3.0',
    recordingPath,
    manualRequests: [],
    excludedRequests: [],
    requestOverrides: {},
    options: {
      loadProfile: {
        executor: 'ramping-vus',
        stages: getInitialStages(),
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
      httpTimeout,
      cloud: {
        loadZones: {
          distribution: 'even',
          zones: [],
        },
      },
    },
    testData: {
      variables: [],
      files: [],
    },
    rules: [createEmptyRule('verification')],
    allowlist: [],
    includeStaticAssets: false,
    scriptName: 'my-script.js',
    wizardUsed: false,
  }
}

export function createStage(target: number, duration = ''): RampingStage {
  return {
    key: newSyntheticKey(),
    target,
    duration,
  }
}

export function getInitialStages() {
  return [createStage(20, '1m'), createStage(20, '3m30s'), createStage(0, '1m')]
}
