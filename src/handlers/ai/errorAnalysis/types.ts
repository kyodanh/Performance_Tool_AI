import { Check, LogEntry } from '@/schemas/k6'
import { RequestStats, RunErrorGroup } from '@/utils/k6/stats'

export enum ErrorAnalysisHandler {
  GetStatus = 'ai:errorAnalysis:getStatus',
  SaveConfig = 'ai:errorAnalysis:saveConfig',
  ClearConfig = 'ai:errorAnalysis:clearConfig',
  TestConnection = 'ai:errorAnalysis:testConnection',
  Analyze = 'ai:errorAnalysis:analyze',
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
}

export type TestConnectionResult = { ok: true } | { ok: false; message: string }

export type SaveConfigResult =
  | { status: ErrorAnalysisStatus }
  | { error: string }

export interface AnalyzeFailureRequest {
  checks: Check[]
  errors: RunErrorGroup[]
  requestStats: RequestStats[]
  logs: LogEntry[]
}

export type AnalyzeFailureResult = { text: string } | { error: string }
