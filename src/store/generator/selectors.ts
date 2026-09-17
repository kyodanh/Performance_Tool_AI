import { DEFAULT_GROUP_NAME } from '@/constants'
import { type GeneratorStore } from '@/store/generator'
import { GeneratorFileData } from '@/types/generator'
import { LoadProfileExecutorOptions, TestOptions } from '@/types/testOptions'
import { sortByGroupOrder } from '@/utils/groups'
import { isNonStaticAssetResponse } from '@/utils/staticAssets'
import {
  exclusionKeys,
  findRequestOverride,
  requestKey,
} from '@/utils/thinkTime'
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

type RequestFilterState = Pick<
  GeneratorStore,
  | 'requests'
  | 'manualRequests'
  | 'allowlist'
  | 'includeStaticAssets'
  | 'excludedRequests'
  | 'requestOverrides'
  | 'groupMoves'
  | 'groupRenames'
  | 'groupOrder'
> &
  // Optional so generators saved before the field still filter.
  Partial<Pick<GeneratorStore, 'disabledRequests'>>

/** The requests that run: what the script, exports and rules are built from. */
export function selectFilteredRequests(state: RequestFilterState) {
  return filterRequests(state, false)
}

/**
 * The requests the list shows: the ones that run plus the disabled ones, which
 * stay visible so they can be enabled again.
 */
export function selectListedRequests(state: RequestFilterState) {
  return filterRequests(state, true)
}

function filterRequests(state: RequestFilterState, includeDisabled: boolean) {
  const excluded = new Set(state.excludedRequests)
  const disabled = new Set(includeDisabled ? [] : state.disabledRequests)
  const keys = exclusionKeys(state.requests)

  // The occurrence key travels with the request: it is what identifies a
  // single recorded request once the list has been filtered.
  const allowedRequests = state.requests
    .map((request, index) => ({ request, occurrenceKey: keys[index]! }))
    .filter(({ request, occurrenceKey }) => {
      return (
        state.allowlist.includes(request.request.host) &&
        !excluded.has(occurrenceKey) &&
        !disabled.has(occurrenceKey) &&
        // Generators saved before exclusions were per occurrence hold a bare
        // `requestKey`, which still removes every identical request.
        !excluded.has(requestKey(request))
      )
    })

  const filtered = state.includeStaticAssets
    ? allowedRequests
    : allowedRequests.filter(({ request }) => isNonStaticAssetResponse(request))

  // An edited recorded request keeps its place in the script, so it replaces
  // the recorded one rather than being appended like a manual request.
  const recordedRequests = filtered.map(({ request, occurrenceKey }) => {
    const override = findRequestOverride(
      state.requestOverrides,
      request,
      occurrenceKey
    )
    // The group belongs to the occurrence, not to the edit, so a generator
    // saved with an older shared override cannot pull every identical request
    // into one group.
    const stored = override
      ? { ...override, id: request.id, group: request.group }
      : request

    const moved = state.groupMoves[occurrenceKey]

    // A move already names a current group, so `groupRenames` - which maps
    // recorded names - must not be applied on top of it.
    if (moved !== undefined) {
      return { ...stored, group: moved }
    }

    const renamed = state.groupRenames[stored.group || DEFAULT_GROUP_NAME]

    return renamed ? { ...stored, group: renamed } : stored
  })

  // Manual requests skip the allowlist and static asset filters, they were
  // added on purpose so they always belong in the script.
  const requests = [
    ...recordedRequests,
    ...state.manualRequests.filter((request) => !disabled.has(request.id)),
  ]

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
    disabledRequests,
    requestOverrides,
    groupMoves,
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
    disabledRequests,
    requestOverrides,
    groupMoves,
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
