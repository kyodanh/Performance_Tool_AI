import { LoadProfileOverrides } from '@/utils/k6/loadProfile'

export enum ScriptHandler {
  Select = 'script:select',
  Run = 'script:run',
  RunLoad = 'script:run-load',
  Analyze = 'script:analyze',
  Stop = 'script:stop',
  Save = 'script:save',
  Log = 'script:log',
  Started = 'script:started',
  Stopped = 'script:stopped',
  Finished = 'script:finished',
  Failed = 'script:failed',
  Check = 'script:check',
  Stats = 'script:stats',
  RunFromGenerator = 'script:run-from-generator',
  BrowserAction = 'script:browser-action',
  BrowserReplay = 'script:browser-replay',
}

export interface RunScriptOptions {
  path: string
  scenario?: string
  shouldTrack?: boolean
}

export interface RunScriptFromGeneratorOptions extends RunScriptOptions {
  content: string
}

export interface RunLoadTestOptions extends LoadProfileOverrides {
  path: string
  /** Script source to write to `path` first, for tests generated on the fly. */
  content?: string
  /** Streams k6's debug log instead of only warnings and errors. */
  verbose?: boolean
  /** Logs every request and response, bodies included. */
  httpDebug?: boolean
}
