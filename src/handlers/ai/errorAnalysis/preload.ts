import { ipcRenderer } from 'electron'

import {
  AnalyzeFailureRequest,
  AnalyzeFailureResult,
  ErrorAnalysisHandler,
  ErrorAnalysisStatus,
  SaveConfigResult,
  SaveErrorAnalysisConfigInput,
  TestConnectionResult,
} from './types'

export function errorAnalysisGetStatus() {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.GetStatus
  ) as Promise<ErrorAnalysisStatus>
}

export function errorAnalysisSaveConfig(config: SaveErrorAnalysisConfigInput) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.SaveConfig,
    config
  ) as Promise<SaveConfigResult>
}

export function errorAnalysisClearConfig() {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.ClearConfig
  ) as Promise<ErrorAnalysisStatus>
}

export function errorAnalysisTestConnection(
  config: SaveErrorAnalysisConfigInput
) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.TestConnection,
    config
  ) as Promise<TestConnectionResult>
}

export function errorAnalysisAnalyzeFailure(request: AnalyzeFailureRequest) {
  return ipcRenderer.invoke(
    ErrorAnalysisHandler.Analyze,
    request
  ) as Promise<AnalyzeFailureResult>
}
