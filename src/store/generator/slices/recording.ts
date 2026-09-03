import { DEFAULT_GROUP_NAME } from '@/constants'
import { ProxyData } from '@/types'
import { ImmerStateCreator } from '@/utils/typescript'

import {
  extractUniqueJsonPaths,
  shouldResetAllowList,
  shouldShowAllowListDialog,
} from './recording.utils'

interface State {
  requests: ProxyData[]
  // Requests added by hand instead of coming from the recording. Kept apart
  // from `requests` because loading a recording replaces that list wholesale.
  manualRequests: ProxyData[]
  // Groups created by hand that hold no requests yet. Only a place to move
  // requests into, so they are not saved with the generator file.
  emptyGroups: string[]
  // The order groups run in, by name. Set by dragging groups in the request
  // list; groups missing from it keep the order their requests give them.
  groupOrder: string[]
  // Recorded requests removed from the test, by `requestKey`. Kept as keys
  // rather than ids so the removal survives reloading the recording.
  excludedRequests: string[]
  // Recorded requests edited by hand, by `requestKey` of the request each one
  // replaces. Keyed for the same reason as `excludedRequests`.
  requestOverrides: Record<string, ProxyData>
  // Group renames, from the name in the recording to the current one. Renaming
  // a recorded request in place would be undone by the next recording load.
  groupRenames: Record<string, string>
  recordingPath: string
  recordingError: unknown
  allowlist: string[]
  showAllowlistDialog: boolean
  includeStaticAssets: boolean
}

interface Actions {
  setRecordingPath: (path: string) => void
  setRecording: (recording: ProxyData[]) => void
  setRecordingError: (error: unknown) => void
  addManualRequest: (request: ProxyData) => void
  replaceImportedRequests: (
    source: NonNullable<ProxyData['source']>,
    requests: ProxyData[]
  ) => void
  updateManualRequest: (id: string, request: ProxyData) => void
  removeManualRequest: (id: string) => void
  toggleExcludedRequest: (key: string) => void
  setRequestOverride: (key: string, request: ProxyData) => void
  clearRequestOverride: (key: string) => void
  restoreExcludedRequests: () => void
  addGroup: (name: string) => void
  renameGroup: (from: string, to: string) => void
  removeGroup: (name: string) => void
  setGroupOrder: (order: string[]) => void
  resetRecording: () => void
  setAllowlist: (value: string[]) => void
  setIncludeStaticAssets: (value: boolean) => void
  setShowAllowlistDialog: (value: boolean) => void
}

export type PreGeneratedJsonPaths = {
  requestJsonPaths: string[]
  responseJsonPaths: string[]
}
export type RecordingSliceStore = State &
  Actions & {
    metadata: PreGeneratedJsonPaths
  }

export const createRecordingSlice: ImmerStateCreator<RecordingSliceStore> = (
  set
) => ({
  metadata: {
    requestJsonPaths: [],
    responseJsonPaths: [],
  },
  requests: [],
  manualRequests: [],
  emptyGroups: [],
  groupOrder: [],
  excludedRequests: [],
  requestOverrides: {},
  groupRenames: {},
  recordingPath: '',
  recordingError: null,
  allowlist: [],
  includeStaticAssets: false,
  showAllowlistDialog: false,
  setRecordingPath: (path: string) =>
    set((state) => {
      state.recordingPath = path
    }),
  setRecording: (requests: ProxyData[]) =>
    set((state) => {
      if (shouldResetAllowList({ requests, allowList: state.allowlist })) {
        state.allowlist = []
      }

      if (
        shouldShowAllowListDialog({
          previousRequests: state.requests,
          requests,
          allowList: state.allowlist,
        })
      ) {
        state.showAllowlistDialog = true
      }

      state.requests = requests

      const { requestJsonPaths, responseJsonPaths } =
        extractUniqueJsonPaths(requests)

      state.metadata = {
        requestJsonPaths,
        responseJsonPaths,
      }
    }),
  setRecordingError: (error: unknown) =>
    set((state) => {
      state.recordingError = error
    }),
  addManualRequest: (request: ProxyData) =>
    set((state) => {
      state.manualRequests.push(request)
    }),
  // Re-importing a script means the script changed, so its previous requests
  // are stale. Only that importer's own requests go, hand-added ones stay.
  replaceImportedRequests: (source, requests) =>
    set((state) => {
      state.manualRequests = [
        ...state.manualRequests.filter((request) => request.source !== source),
        ...requests,
      ]
    }),
  updateManualRequest: (id: string, request: ProxyData) =>
    set((state) => {
      const index = state.manualRequests.findIndex(
        (manualRequest) => manualRequest.id === id
      )

      if (index !== -1) {
        state.manualRequests[index] = request
      }
    }),
  removeManualRequest: (id: string) =>
    set((state) => {
      state.manualRequests = state.manualRequests.filter(
        (request) => request.id !== id
      )
    }),
  toggleExcludedRequest: (key: string) =>
    set((state) => {
      state.excludedRequests = state.excludedRequests.includes(key)
        ? state.excludedRequests.filter((excluded) => excluded !== key)
        : [...state.excludedRequests, key]
    }),
  setRequestOverride: (key: string, request: ProxyData) =>
    set((state) => {
      state.requestOverrides[key] = request
    }),
  clearRequestOverride: (key: string) =>
    set((state) => {
      delete state.requestOverrides[key]
    }),
  restoreExcludedRequests: () =>
    set((state) => {
      state.excludedRequests = []
    }),
  addGroup: (name: string) =>
    set((state) => {
      if (!state.emptyGroups.includes(name)) {
        state.emptyGroups.push(name)
      }
    }),
  renameGroup: (from: string, to: string) =>
    set((state) => {
      // Requests loaded from a recording have no group of their own when the
      // HAR has no pageref, so they answer to the default name.
      const rename = (request: ProxyData) => {
        if ((request.group || DEFAULT_GROUP_NAME) === from) {
          request.group = to
        }
      }

      state.requests.forEach(rename)
      state.manualRequests.forEach(rename)
      // Follow any earlier rename of the same group, so the mapping always
      // points from the recorded name to the current one.
      Object.keys(state.groupRenames).forEach((recorded) => {
        if (state.groupRenames[recorded] === from) {
          state.groupRenames[recorded] = to
        }
      })
      state.groupRenames[from] = to
      Object.values(state.requestOverrides).forEach(rename)
      state.emptyGroups = state.emptyGroups.map((group) =>
        group === from ? to : group
      )
      state.groupOrder = state.groupOrder.map((group) =>
        group === from ? to : group
      )
    }),
  removeGroup: (name: string) =>
    set((state) => {
      state.emptyGroups = state.emptyGroups.filter((group) => group !== name)
      state.groupOrder = state.groupOrder.filter((group) => group !== name)
    }),
  setGroupOrder: (order: string[]) =>
    set((state) => {
      state.groupOrder = order
    }),
  resetRecording: () =>
    set((state) => {
      state.requests = []
      state.emptyGroups = []
      state.groupOrder = []
      state.allowlist = []
      state.excludedRequests = []
      state.requestOverrides = {}
      state.recordingPath = ''
    }),
  setAllowlist: (value) =>
    set((state) => {
      state.allowlist = value
    }),
  setIncludeStaticAssets: (value) =>
    set((state) => {
      state.includeStaticAssets = value
    }),

  setShowAllowlistDialog: (value) =>
    set((state) => {
      state.showAllowlistDialog = value
    }),
})
