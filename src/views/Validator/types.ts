import { BrowserDebuggerEvent, BrowserReplayEvent } from '@/main/runner/schema'
import { Check, LogEntry } from '@/schemas/k6'
import { ProxyData } from '@/types'
import { RunStats } from '@/utils/k6/stats'

export type DebuggerState = 'pending' | 'running' | 'stopped'

export interface DebugSession {
  id: string
  state: DebuggerState
  requests: ProxyData[]
  browser: {
    actions: BrowserDebuggerEvent[]
    replay: BrowserReplayEvent[]
  }
  logs: LogEntry[]
  checks: Check[]
  stats: RunStats | null
}
