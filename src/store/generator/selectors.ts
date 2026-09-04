import { DEFAULT_GROUP_NAME } from '@/constants'
import { type GeneratorStore } from '@/store/generator'
import { GeneratorFileData } from '@/types/generator'
import { LoadProfileExecutorOptions, TestOptions } from '@/types/testOptions'
import { sortByGroupOrder } from '@/utils/groups'
import { isNonStaticAssetResponse } from '@/utils/staticAssets'
import { exclusionKeys, requestKey } from '@/utils/thinkTime'
import { exhaustive } from '@/utils/typescript'

export function selectRuleById(state: GeneratorStore, id?: string) {
  return state.rules.find((rule) => rule.id === id)
}

export function selectSelectedRule(state: GeneratorStore) {
  if (!state.selectedRuleId) {
    return
  }
  return selectRuleById(state, state.selectedRuleId)
}

export function selectIsRulePreviewable(state: GeneratorStore) {
  const rule = selectSelectedRule(state)
  return (
    ['correlation', 'parameterization'].includes(rule?.type ?? '') &&
    rule?.enabled
  )
}

export function selectHasRecording(state: GeneratorStore) {
  return (
    state.recordingError === null && selectFilteredRequests(state).length > 0
  )
}

export function selectFilteredRequests(
  state: Pick<
    GeneratorStore,
    | 'requests'
    | 'manualRequests'
    | 'allowlist'
    | 'includeStaticAssets'
    | 'excludedRequests'
    | 'requestOverrides'
    | 'groupRenames'
    | 'groupOrder'
  >
) {
  const excluded = new Set(state.excludedRequests)
  const keys = exclusionKeys(state.requests)

  const allowedRequests = state.requests.filter((request, index) => {
    return (
      state.allowlist.includes(request.request.host) &&
      !excluded.has(keys[index]!) &&
      // Generators saved before exclusions were per occurrence hold a bare
      // `requestKey`, which still removes every identical request.
      !excluded.has(requestKey(request))
    )
  })

  const filtered = state.includeStaticAssets
    ? allowedRequests
    : allowedRequests.filter(isNonStaticAssetResponse)

  // An edited recorded request keeps its place in the script, so it replaces
  // the recorded one rather than being appended like a manual request.
  const recordedRequests = filtered.map((request) => {
    const override = state.requestOverrides[requestKey(request)]
    const stored = override ? { ...override, id: request.id } : request
    const renamed = state.groupRenames[stored.group || DEFAULT_GROUP_NAME]

    return renamed ? { ...stored, group: renamed } : stored
  })

  // Manual requests skip the allowlist and static asset filters, they were
  // added on purpose so they always belong in the script.
  const requests = [...recordedRequests, ...state.manualRequests]

  // Sorting here rather than in the view so the script, the exports and the
  // request list all run the groups in the same order.
  return sortByGroupOrder(
    requests,
    state.groupOrder,
    (request) => request.group || DEFAULT_GROUP_NAME
  )
}

export function selectGeneratorData(state: GeneratorStore): GeneratorFileData {
  const loadProfile = selectLoadProfile(state)
  const {
    sleepType,
    timing,
    thinkTimeOverrides,
    rendezvous,
    thresholds,
    loadZones,
    httpTimeout,
    variables,
    files,
    recordingPath,
    rules,
    allowlist,
    manualRequests,
    excludedRequests,
    requestOverrides,
    groupRenames,
    groupOrder,
    includeStaticAssets,
    scriptName,
    wizardUsed,
  } = state

  return {
    version: '3.0',
    recordingPath,
    options: {
      loadProfile,
      thinkTime: {
        sleepType,
        timing,
        overrides: thinkTimeOverrides,
      },
      rendezvous,
      thresholds,
      httpTimeout,
      cloud: { loadZones },
    },
    testData: { variables, files },
    rules,
    allowlist,
    manualRequests,
    excludedRequests,
    requestOverrides,
    groupRenames,
    groupOrder,
    includeStaticAssets,
    scriptName,
    wizardUsed,
  }
}

function selectLoadProfile({
  executor,
  stages,
  vus,
  iterations,
}: GeneratorStore): TestOptions['loadProfile'] {
  switch (executor) {
    case 'ramping-vus':
      return {
        executor,
        stages,
      }
    case 'shared-iterations':
      return {
        executor,
        vus,
        iterations,
      }
    default:
      return exhaustive(executor)
  }
}

export function selectHasVerificationRule(state: GeneratorStore) {
  return state.rules.some((rule) => rule.type === 'verification')
}

export function selectHasGroups(state: GeneratorStore) {
  return state.requests.some((request) => request.group)
}

export function selectLoadProfileExecutorOptions(
  state: GeneratorStore
): LoadProfileExecutorOptions {
  const { executor, stages, vus, iterations } = state
  // Always pass all executor-specific fields so the LoadProfile form defaultValues
  // retain e.g. stages while shared-iterations is active (Zod strips extras on parse).
  return { executor, stages, vus, iterations }
}

export function selectSelectedRuleIndex(state: GeneratorStore) {
  const selectedRule = selectSelectedRule(state)
  if (!selectedRule) {
    return 0
  }

  return state.rules
    .filter((rule) => rule.type === selectedRule.type)
    .findIndex((rule) => rule.id === state.selectedRuleId)
}
