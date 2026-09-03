import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { Check, LogEntry } from '@/schemas/k6'
import { MachineResources, MachineSample } from '@/types/systemMetrics'
import { RunStats } from '@/utils/k6/stats'

/**
 * The live state of the load test running in the main process. Kept here
 * rather than in the Controller panel because the run outlives the panel: the
 * k6 process belongs to the main process, so navigating to another view used
 * to lose the run — no metrics, no Stop button, and Start would happily launch
 * a second run over the first.
 */
interface State {
  /** A run this app started that main has not reported as over. */
  isRunning: boolean
  /**
   * Set while a stop is in flight. Stopping sends SIGTERM, and k6 reports that
   * as an error log entry ("aborted because k6 received a 'terminated'
   * signal") on every generator. A deliberate stop is not a failure.
   */
  isStopping: boolean
  stats: RunStats | null
  /**
   * CPU and memory of every machine driving the run. Peaks live here so they
   * survive the panel that samples them — but nothing samples while no panel is
   * mounted, so a peak reached in that window is missed.
   */
  resources: MachineResources[]
  logs: LogEntry[]
  checks: Check[]
  errors: string[]
}

interface Actions {
  /** Clears the previous run and starts collecting the next one. */
  startRun: () => void
  /** A stop the user asked for. */
  stopRun: () => void
  /** A run that never got going — archiving, a syntax error, a bad option. */
  failRun: (message: string) => void
  /** Records one CPU/memory sample per machine, tracking each machine's peaks. */
  sampleResources: (samples: MachineSample[]) => void
}

export type LoadRunStore = State & Actions

export const useLoadRunStore = create<LoadRunStore>()(
  immer((set) => ({
    isRunning: false,
    isStopping: false,
    stats: null,
    resources: [],
    logs: [],
    checks: [],
    errors: [],

    startRun: () => {
      subscribe()

      set((state) => {
        state.isRunning = true
        state.isStopping = false
        state.stats = null
        state.resources = []
        state.logs = []
        state.checks = []
        state.errors = []
      })
    },

    stopRun: () => {
      set((state) => {
        state.isRunning = false
        state.isStopping = true
      })
    },

    failRun: (message) => {
      set((state) => {
        state.isRunning = false
        state.errors.push(message)
      })
    },

    sampleResources: (samples) => {
      set((state) => {
        state.resources = samples.map((sample) => {
          const previous = state.resources.find(({ id }) => id === sample.id)

          return {
            ...sample,
            peakCpuPercent: Math.max(
              sample.cpuPercent,
              previous?.peakCpuPercent ?? 0
            ),
            peakMemUsedBytes: Math.max(
              sample.memUsedBytes,
              previous?.peakMemUsedBytes ?? 0
            ),
          }
        })
      })
    },
  }))
)

let subscribed = false

/**
 * Attaches the run feed to the store on the first run and never detaches it —
 * that is the point, the feed has to keep filling while no panel is mounted.
 * Events are ignored unless a load run is in flight, so a debug run in the
 * validator does not write over the last load test's results.
 */
export function subscribe() {
  if (subscribed) {
    return
  }

  subscribed = true

  window.studio.script.onScriptStats((stats) => {
    useLoadRunStore.setState((state) => {
      if (state.isRunning) {
        state.stats = stats
      }
    })
  })

  window.studio.script.onScriptCheck((checks) => {
    useLoadRunStore.setState((state) => {
      if (state.isRunning) {
        state.checks = checks
      }
    })
  })

  window.studio.script.onScriptLog((entry) => {
    useLoadRunStore.setState((state) => {
      if (!state.isRunning) {
        return
      }

      state.logs.push(entry)

      if (entry.level === 'error' && !state.isStopping) {
        state.errors.push(entry.error ?? entry.msg)
      }
    })
  })

  window.studio.script.onScriptStopped(() => {
    useLoadRunStore.setState((state) => {
      state.isRunning = false
    })
  })
}
