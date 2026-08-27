import { Check, LogEntry } from '@/schemas/k6'
import { RequestStats, RunErrorGroup, RunStats } from '@/utils/k6/stats'

export enum ErrorAnalysisHandler {
  GetStatus = 'ai:errorAnalysis:getStatus',
  SaveConfig = 'ai:errorAnalysis:saveConfig',
  ClearConfig = 'ai:errorAnalysis:clearConfig',
  TestConnection = 'ai:errorAnalysis:testConnection',
  Analyze = 'ai:errorAnalysis:analyze',
  SetUseForAssistant = 'ai:errorAnalysis:setUseForAssistant',
}

export interface ErrorAnalysisConfigInput {
  baseUrl: string
  model: string
  apiKey: string
}

/** apiKey is omitted to keep the currently saved key unchanged. */
export interface SaveErrorAnalysisConfigInput {
  baseUrl: string
  model: string
  apiKey?: string
}

export interface ErrorAnalysisStatus {
  configured: boolean
  baseUrl: string | null
  model: string | null
  /**
   * Drive the Assistant (setup wizard, autocorrelation) with this provider
   * instead of the Grafana Assistant. Always false while unconfigured.
   */
  useForAssistant: boolean
}

export type TestConnectionResult = { ok: true } | { ok: false; message: string }

export type SaveConfigResult =
  | { status: ErrorAnalysisStatus }
  | { error: string }

/** Headline numbers of a run, minus the per-sample series. */
export type RunSummary = Omit<
  RunStats,
  'buckets' | 'groups' | 'requestStats' | 'checks' | 'errors'
>

/**
 * A run handed to the model. With failures present it is read as a failure
 * analysis; without them, as a performance review of a successful run.
 */
export interface AnalyzeFailureRequest {
  checks: Check[]
  errors: RunErrorGroup[]
  requestStats: RequestStats[]
  logs: LogEntry[]
  summary?: RunSummary
}

export type AnalyzeFailureResult = { text: string } | { error: string }
