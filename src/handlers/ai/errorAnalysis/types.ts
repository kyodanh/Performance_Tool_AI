import { Check, LogEntry } from '@/schemas/k6'
import { Sla, SlaVerdict } from '@/utils/k6/sla'
import { RequestStats, RunErrorGroup, RunStats } from '@/utils/k6/stats'

export enum ErrorAnalysisHandler {
  GetStatus = 'ai:errorAnalysis:getStatus',
  SaveConfig = 'ai:errorAnalysis:saveConfig',
  DeleteProvider = 'ai:errorAnalysis:deleteProvider',
  SetActiveProvider = 'ai:errorAnalysis:setActiveProvider',
  SaveTypesafe = 'ai:errorAnalysis:saveTypesafe',
  TestConnection = 'ai:errorAnalysis:testConnection',
  Analyze = 'ai:errorAnalysis:analyze',
  SetUseForAssistant = 'ai:errorAnalysis:setUseForAssistant',
}

export interface ErrorAnalysisConfigInput {
  baseUrl: string
  model: string
  apiKey: string
}

/**
 * A provider from the Settings form. No `id` adds a new one; apiKey is omitted
 * to keep that provider's saved key unchanged.
 */
export interface AiProviderInput {
  id?: string
  name: string
  baseUrl: string
  model: string
  apiKey?: string
}

/** A saved provider as the renderer sees it — never with its key. */
export interface AiProviderSummary {
  id: string
  name: string
  baseUrl: string
  model: string
}

/** apiKey is omitted to keep the saved key; null removes TypeSafe. */
export type SaveTypesafeInput = { apiKey?: string; enabled: boolean } | null

export interface ErrorAnalysisStatus {
  /** A provider is active; false means AI runs on the Grafana Assistant. */
  configured: boolean
  /** The active provider's endpoint and model. */
  baseUrl: string | null
  model: string | null
  /**
   * Drive the Assistant (setup wizard, autocorrelation) with this provider
   * instead of the Grafana Assistant. Always false while unconfigured.
   */
  useForAssistant: boolean
  activeId: string | null
  providers: AiProviderSummary[]
  /** Error triage by TypeSafe Jev. */
  typesafe: {
    configured: boolean
    enabled: boolean
    /** Where the key triage runs with comes from; null when it will not run. */
    source: 'settings' | 'env' | null
  }
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
  /** The ceiling the run was judged against. Absent when none was set. */
  sla?: Sla
  slaVerdict?: SlaVerdict
}

/** 'ai' explains the run with the active LLM; 'jev' is TypeSafe Jev's triage alone. */
export type AnalysisEngine = 'ai' | 'jev'

/** How far Jev's verdict is trusted: sure, in between, or needs a person. */
export type TriageRoute = 'auto' | 'llm' | 'human'

/** One error group as Jev judged it, with the facts it was given. */
export interface TriageRow {
  /** Last path segment of the URL. */
  endpoint: string
  group: string
  /** k6 error code, e.g. `1500`. */
  code: string
  /** `HTTP 500 Internal Server Error`, or the error message. */
  meaning: string
  count: number
  /** Stats of the request row with the failing status, when recorded. */
  request?: { failed: number; count: number; avg: number; max: number }
  /** Most likely first; shares under 5% left out. */
  causes: { cause: string; label: string; share: number }[]
  /** Null when Jev left this error unanswered. */
  confidence: number | null
}

export interface JevReport {
  rows: TriageRow[]
  /** The least sure answer across the rows. */
  confidence: number
  route: TriageRoute
}

/**
 * `text` is the LLM's answer (empty for Jev alone or when the LLM failed,
 * then `llmError` says why); `jev` is present whenever Jev answered.
 */
export type AnalyzeFailureResult =
  | { text: string; jev?: JevReport; llmError?: string }
  | { error: string }
