import { SleepType, Timing } from '@/types/testOptions'
import { createFixedTiming } from '@/utils/thinkTime'
import { ImmerStateCreator } from '@/utils/typescript'

interface State {
  sleepType: SleepType
  timing: Timing
  // Keyed by `requestKey`, not by request id.
  thinkTimeOverrides: Record<string, Timing>
  // ponytail: rendezvous rides along in this slice — same per-request override
  // shape, same key. Split it out if it grows its own settings.
  rendezvous: Record<string, true>
}

interface Actions {
  setSleepType: (value: SleepType) => void
  setTiming: (timing: Timing) => void
  // `null` drops the override so the request falls back to the global timing.
  setThinkTimeOverride: (key: string, timing: Timing | null) => void
  toggleRendezvous: (key: string) => void
}

export type ThinkTimeStore = State & Actions

export const createThinkTimeSlice: ImmerStateCreator<ThinkTimeStore> = (
  set
) => ({
  sleepType: 'groups',
  timing: createFixedTiming(),
  thinkTimeOverrides: {},
  rendezvous: {},

  setSleepType: (value: SleepType) =>
    set((state) => {
      state.sleepType = value
    }),

  setTiming: (timing: Timing) =>
    set((state) => {
      state.timing = timing
    }),

  setThinkTimeOverride: (key: string, timing: Timing | null) =>
    set((state) => {
      if (timing === null) {
        delete state.thinkTimeOverrides[key]
        return
      }

      state.thinkTimeOverrides[key] = timing
    }),

  toggleRendezvous: (key: string) =>
    set((state) => {
      if (state.rendezvous[key]) {
        delete state.rendezvous[key]
        return
      }

      state.rendezvous[key] = true
    }),
})
