import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { captureException } from '@sentry/electron/main'
import { generateText, streamText } from 'ai'
import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { randomUUID } from 'node:crypto'

import { GrafanaAssistantLanguageModel } from '../grafanaAssistantProvider'
import { routeTriage, Triage, triageErrors } from '../typesafe/triageErrors'

import { buildFailureAnalysisPrompt } from './buildPrompt'
import {
  deleteProvider,
  getErrorAnalysisConfig,
  getErrorAnalysisStatus,
  getProviderApiKey,
  getTypesafeApiKey,
  saveProvider,
  saveTypesafeConfig,
  setActiveProvider,
  setUseForAssistant,
} from './store'
import {
  AiProviderInput,
  AnalysisEngine,
  AnalyzeFailureRequest,
  AnalyzeFailureResult,
  ErrorAnalysisConfigInput,
  ErrorAnalysisHandler,
  JevReport,
  SaveConfigResult,
  SaveTypesafeInput,
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
function trimConfig(config: AiProviderInput): AiProviderInput {
  const model = config.model.trim()

  return {
    id: config.id,
    // Unnamed providers are told apart by their model.
    name: config.name.trim() || model,
    model,
    baseUrl: config.baseUrl.trim(),
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
 * A blank `apiKey` means "use the provider's saved key" — the renderer never
 * holds the plaintext key once it's been saved, so it can't resend it.
 */
async function resolveApiKey({ apiKey, id }: AiProviderInput) {
  if (apiKey) {
    return apiKey
  }

  return id ? getProviderApiKey(id) : null
}

export function initialize() {
  ipcMain.handle(ErrorAnalysisHandler.GetStatus, () => {
    return getErrorAnalysisStatus()
  })

  ipcMain.handle(
    ErrorAnalysisHandler.SaveConfig,
    async (_event, input: AiProviderInput): Promise<SaveConfigResult> => {
      const config = trimConfig(input)

      if (!isValidUrl(config.baseUrl)) {
        return { error: 'Base URL must be a valid URL.' }
      }

      const apiKey = await resolveApiKey(config)

      if (!apiKey) {
        return { error: 'API key is required.' }
      }

      await saveProvider({ ...config, apiKey })

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

  ipcMain.handle(
    ErrorAnalysisHandler.DeleteProvider,
    async (_event, id: string) => {
      await deleteProvider(id)
      return getErrorAnalysisStatus()
    }
  )

  ipcMain.handle(
    ErrorAnalysisHandler.SetActiveProvider,
    async (_event, id: string | null) => {
      await setActiveProvider(id)
      return getErrorAnalysisStatus()
    }
  )

  ipcMain.handle(
    ErrorAnalysisHandler.SaveTypesafe,
    async (_event, input: SaveTypesafeInput) => {
      await saveTypesafeConfig(
        input && { ...input, apiKey: input.apiKey?.trim() || undefined }
      )
      return getErrorAnalysisStatus()
    }
  )

  ipcMain.handle(
    ErrorAnalysisHandler.TestConnection,
    async (_event, input: AiProviderInput): Promise<TestConnectionResult> => {
      const config = trimConfig(input)
      const apiKey = await resolveApiKey(config)

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
      request: AnalyzeFailureRequest,
      engine: AnalysisEngine = 'ai'
    ): Promise<AnalyzeFailureResult> => {
      if (engine === 'jev') {
        return triageOnly(request)
      }

      // No custom provider falls back to the Grafana Assistant, which serves
      // the rest of the app's AI. It throws a sign-in message when unavailable.
      const config = await getErrorAnalysisConfig()

      // Jev goes first; the LLM always follows with Jev's odds in its prompt.
      // Jev's confidence only decides how much its verdict is trusted. No
      // lines (no key, no errors, call failed) leaves it all to the LLM.
      const triage = await triageErrors(request, await getTypesafeApiKey())
      const jev = jevReport(triage)

      // The SDK reports what actually went wrong (a 401 from the gateway, a
      // dead endpoint) to `onError` and then rejects `text` with a generic
      // "No output generated", so without capturing it here both the log and
      // the UI lose the only message that says why.
      let cause: unknown = null

      try {
        const { text } = streamText({
          model: config ? languageModelFor(config) : grafanaAssistantModel,
          prompt: buildFailureAnalysisPrompt(request, triage.lines),
          abortSignal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
          onError: ({ error }) => {
            cause = error
            log.error('[ErrorAnalysis] Stream failed:', error)
          },
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

        return { text: await text, jev }
      } catch (error) {
        const reported = cause ?? error

        log.error('[ErrorAnalysis] Analyze failed:', reported)
        captureException(reported, { tags: { component: 'ai-error-analysis' } })

        const message =
          reported instanceof Error ? reported.message : 'Unknown error'

        // A failed LLM must not take Jev's verdict down with it.
        if (jev) {
          return { text: '', jev, llmError: message }
        }

        return {
          error: message,
        }
      }
    }
  )
}

/** Jev runs on its own, from its own button — no LLM involved. */
async function triageOnly(
  request: AnalyzeFailureRequest
): Promise<AnalyzeFailureResult> {
  const apiKey = await getTypesafeApiKey()

  if (!apiKey) {
    return {
      error:
        'TypeSafe Jev chưa có key dùng được. Vào Settings → AI, nhập lại API key rồi Save.',
    }
  }

  if (request.errors.length === 0) {
    return { text: 'Run này không có lỗi nào để TypeSafe Jev phân loại.' }
  }

  const jev = jevReport(await triageErrors(request, apiKey))

  if (!jev) {
    return {
      error: 'TypeSafe Jev không trả về kết quả. Xem log để biết lý do.',
    }
  }

  return { text: '', jev }
}

function jevReport({ rows, confidence }: Triage): JevReport | undefined {
  return rows.length > 0
    ? { rows, confidence, route: routeTriage(confidence) }
    : undefined
}
