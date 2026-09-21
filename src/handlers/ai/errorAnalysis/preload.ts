import { ipcRenderer } from 'electron'

import {
  AnalysisEngine,
  AnalyzeFailureRequest,
  AnalyzeFailureResult,
  ErrorAnalysisHandler,
  ErrorAnalysisStatus,
  SaveConfigResult,
  AiProviderInput,
  SaveTypesafeInput,
  TestConnectionResult,
} from './types'

export function errorAnalysisGetStatus() {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.GetStatus
  ) as Promise<ErrorAnalysisStatus>
}

export function errorAnalysisSaveConfig(config: AiProviderInput) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.SaveConfig,
    config
  ) as Promise<SaveConfigResult>
}

export function errorAnalysisDeleteProvider(id: string) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.DeleteProvider,
    id
  ) as Promise<ErrorAnalysisStatus>
}

/** null selects the Grafana Assistant. */
export function errorAnalysisSetActiveProvider(id: string | null) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.SetActiveProvider,
    id
  ) as Promise<ErrorAnalysisStatus>
}

export function errorAnalysisSaveTypesafe(input: SaveTypesafeInput) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.SaveTypesafe,
    input
  ) as Promise<ErrorAnalysisStatus>
}

export function errorAnalysisTestConnection(config: AiProviderInput) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.TestConnection,
    config
  ) as Promise<TestConnectionResult>
}

export function errorAnalysisSetUseForAssistant(useForAssistant: boolean) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.SetUseForAssistant,
    useForAssistant
  ) as Promise<ErrorAnalysisStatus>
}

export function errorAnalysisAnalyzeFailure({
  request,
  engine = 'ai',
}: {
  request: AnalyzeFailureRequest
  engine?: AnalysisEngine
}) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.Analyze,
    request,
    engine
  ) as Promise<AnalyzeFailureResult>
}
