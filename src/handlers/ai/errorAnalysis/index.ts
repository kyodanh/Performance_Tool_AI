import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { captureException } from '@sentry/electron/main'
import { generateText, streamText } from 'ai'
import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { randomUUID } from 'node:crypto'

import { GrafanaAssistantLanguageModel } from '../grafanaAssistantProvider'

import { buildFailureAnalysisPrompt } from './buildPrompt'
import {
  clearErrorAnalysisConfig,
  getErrorAnalysisConfig,
  getErrorAnalysisStatus,
  saveErrorAnalysisConfig,
  setUseForAssistant,
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

/** Sessions live inside the provider, keyed by chatId, so one instance does. */
const grafanaAssistantModel = new GrafanaAssistantLanguageModel()

const TEST_CONNECTION_TIMEOUT_MS = 15_000
const ANALYZE_TIMEOUT_MS = 60_000

/**
 * Pasted values commonly carry a trailing newline or space. An untrimmed key
 * goes out as an invalid Authorization header, and gateways answer 401
 * ("invalid or missing token") — indistinguishable from a wrong key.
 */
function trimConfig(
  config: SaveErrorAnalysisConfigInput
): SaveErrorAnalysisConfigInput {
  return {
    baseUrl: config.baseUrl.trim(),
    model: config.model.trim(),
    apiKey: config.apiKey?.trim() || undefined,
  }
}

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
 * The model the Assistant should run on instead of the Grafana Assistant, or
 * null to keep using Grafana (not selected, not configured, or key unreadable).
 */
export async function getAssistantModelOverride() {
  const status = await getErrorAnalysisStatus()

  if (!status.useForAssistant) {
    return null
  }

  const config = await getErrorAnalysisConfig()

  return config ? languageModelFor(config) : null
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
      input: SaveErrorAnalysisConfigInput
    ): Promise<SaveConfigResult> => {
      const config = trimConfig(input)

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

  ipcMain.handle(
    ErrorAnalysisHandler.SetUseForAssistant,
    async (_event, useForAssistant: unknown) => {
      await setUseForAssistant(useForAssistant === true)
      return getErrorAnalysisStatus()
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
      input: SaveErrorAnalysisConfigInput
    ): Promise<TestConnectionResult> => {
      const config = trimConfig(input)
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
      // No custom provider falls back to the Grafana Assistant, which serves
      // the rest of the app's AI. It throws a sign-in message when unavailable.
      const config = await getErrorAnalysisConfig()

      try {
        const { text } = streamText({
          model: config ? languageModelFor(config) : grafanaAssistantModel,
          prompt: buildFailureAnalysisPrompt(request),
          abortSignal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
          // The Assistant keys its A2A session on this; a fresh id per run
          // keeps each analysis its own conversation.
          ...(config
            ? {}
            : {
                providerOptions: {
                  grafanaAssistant: { chatId: `analysis-${randomUUID()}` },
                },
              }),
        })
        return { text: await text }
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
