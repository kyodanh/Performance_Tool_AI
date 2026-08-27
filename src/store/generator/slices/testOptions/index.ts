import { ImmerStateCreator } from '@/utils/typescript'

import { HttpTimeoutStore, createHttpTimeoutSlice } from './httpTimeout'
import { LoadProfileStore, createLoadProfileSlice } from './loadProfile'
import { LoadZoneStore, createLoadZoneSlice } from './loadZones'
import { ThinkTimeStore, createThinkTimeSlice } from './thinkTime'
import { createThresholdSlice, ThresholdStore } from './thresholds'

export type TestOptionsStore = LoadProfileStore &
  ThinkTimeStore &
  ThresholdStore &
  LoadZoneStore &
  HttpTimeoutStore

export const createTestOptionsSlice: ImmerStateCreator<TestOptionsStore> = (
  ...args
) => ({
  ...createLoadProfileSlice(...args),
  ...createThinkTimeSlice(...args),
  ...createThresholdSlice(...args),
  ...createLoadZoneSlice(...args),
  ...createHttpTimeoutSlice(...args),
})
