import { LogEntry } from '@/schemas/k6'

export type LogSource = 'browser' | 'runtime' | 'script'

export interface SourcesOptions {
  browser: boolean
  runtime: boolean
  script: boolean
}

export interface ConsoleFilter {
  levels: Array<LogEntry['level']>
  sources: Array<LogSource>
}

/** A log line, optionally carrying fields the app shows apart from the message. */
export type DisplayLogEntry = LogEntry & {
  /** A second line under the message, e.g. the failing request's URL. */
  detail?: string
  /** Short facts shown as chips: transaction, count, VU / iteration, data row. */
  tags?: string[]
}

export interface LogEntryWithSource {
  source: LogSource
  entry: DisplayLogEntry
}
