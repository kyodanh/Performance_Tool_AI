import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { captureException } from '@sentry/electron/main'
import { generateText } from 'ai'
import { ipcMain } from 'electron'
import log from 'electron-log/main'

import { buildFailureAnalysisPrompt } from './buildPrompt'
import {
  clearErrorAnalysisConfig,
  getErrorAnalysisConfig,
  getErrorAnalysisStatus,
  saveErrorAnalysisConfig,
} from './store'
import {
  AnalyzeFailureRequest,
  AnalyzeFailureResult,
  ErrorAnalysisConfigInput,
  ErrorAnalysisHandler,
  SaveConfigResult,
  SaveErrorAnalysisConfigInput,
  TestConnectionResult,
} from './types'

const TEST_CONNECTION_TIMEOUT_MS = 15_000
const ANALYZE_TIMEOUT_MS = 60_000

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function languageModelFor(config: ErrorAnalysisConfigInput) {
  const provider = createOpenAICompatible({
    name: 'k6-studio-error-analysis',
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  })

  return provider(config.model)
}

/**
 * A blank `apiKey` means "use the currently saved key" — the renderer never
 * holds the plaintext key once it's been saved, so it can't resend it.
 */
async function resolveApiKey(providedKey: string | undefined) {
  if (providedKey) {
    return providedKey
  }

  const existing = await getErrorAnalysisConfig()
  return existing?.apiKey ?? null
}

export function initialize() {
  ipcMain.handle(ErrorAnalysisHandler.GetStatus, () => {
    return getErrorAnalysisStatus()
  })

  ipcMain.handle(
    ErrorAnalysisHandler.SaveConfig,
    async (
      _event,
      config: SaveErrorAnalysisConfigInput
    ): Promise<SaveConfigResult> => {
      if (!isValidUrl(config.baseUrl)) {
        return { error: 'Base URL must be a valid URL.' }
      }

      const apiKey = await resolveApiKey(config.apiKey)

      if (!apiKey) {
        return { error: 'API key is required.' }
      }

      await saveErrorAnalysisConfig({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey,
      })

      return { status: await getErrorAnalysisStatus() }
    }
  )

  ipcMain.handle(ErrorAnalysisHandler.ClearConfig, async () => {
    await clearErrorAnalysisConfig()
    return getErrorAnalysisStatus()
  })

  ipcMain.handle(
    ErrorAnalysisHandler.TestConnection,
    async (
      _event,
      config: SaveErrorAnalysisConfigInput
    ): Promise<TestConnectionResult> => {
      const apiKey = await resolveApiKey(config.apiKey)

      if (!apiKey) {
        return { ok: false, message: 'API key is required.' }
      }

      try {
        await generateText({
          model: languageModelFor({ ...config, apiKey }),
          prompt: 'Reply with "ok".',
          abortSignal: AbortSignal.timeout(TEST_CONNECTION_TIMEOUT_MS),
        })
        return { ok: true }
      } catch (error) {
        log.warn('[ErrorAnalysis] Test connection failed:', error)
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )

  ipcMain.handle(
    ErrorAnalysisHandler.Analyze,
    async (
      _event,
      request: AnalyzeFailureRequest
    ): Promise<AnalyzeFailureResult> => {
      const config = await getErrorAnalysisConfig()

      if (!config) {
        return { error: 'AI provider is not configured.' }
      }

      try {
        const { text } = await generateText({
          model: languageModelFor(config),
          prompt: buildFailureAnalysisPrompt(request),
          abortSignal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
        })
        return { text }
      } catch (error) {
        log.error('[ErrorAnalysis] Analyze failed:', error)
        captureException(error, { tags: { component: 'ai-error-analysis' } })
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )
}
