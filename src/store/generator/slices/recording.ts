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
  updateManualRequest: (id: string, request: ProxyData) => void
  removeManualRequest: (id: string) => void
  addGroup: (name: string) => void
  renameGroup: (from: string, to: string) => void
  removeGroup: (name: string) => void
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
      state.emptyGroups = state.emptyGroups.map((group) =>
        group === from ? to : group
      )
    }),
  removeGroup: (name: string) =>
    set((state) => {
      state.emptyGroups = state.emptyGroups.filter((group) => group !== name)
    }),
  resetRecording: () =>
    set((state) => {
      state.requests = []
      state.emptyGroups = []
      state.allowlist = []
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
