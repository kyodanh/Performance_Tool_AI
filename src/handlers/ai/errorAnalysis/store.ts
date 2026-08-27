import { app } from 'electron'
import log from 'electron-log/main'
import { z } from 'zod'

import { decryptString, encryptString } from '@/main/encryption'
import { readFile, unlink, writeFile } from '@/utils/fs'
import * as path from '@/utils/path'
import { isNodeJsErrnoException } from '@/utils/typescript'

import { ErrorAnalysisConfigInput, ErrorAnalysisStatus } from './types'

const ErrorAnalysisConfigStoreSchema = z.object({
  version: z.literal('1.0'),
  baseUrl: z.string(),
  model: z.string(),
  apiKey: z.string(),
  // Optional: files written before the Assistant could use this provider
  // have no such key, and absent means "Grafana Assistant".
  useForAssistant: z.boolean().optional(),
})

type ErrorAnalysisConfigStore = z.infer<typeof ErrorAnalysisConfigStoreSchema>

const fileName =
  process.env.NODE_ENV === 'development'
    ? 'k6-studio-error-analysis-provider-dev.json'
    : 'k6-studio-error-analysis-provider.json'

const filePath = path.join(app.getPath('userData'), fileName)

let cache: ErrorAnalysisConfigStore | null | undefined

async function readStore(): Promise<ErrorAnalysisConfigStore | null> {
  if (cache !== undefined) {
    return cache
  }

  try {
    const file = await readFile(filePath, 'utf-8')
    cache = ErrorAnalysisConfigStoreSchema.parse(JSON.parse(file))
    return cache
  } catch (error) {
    if (!isNodeJsErrnoException(error) || error.code !== 'ENOENT') {
      log.warn(
        '[ErrorAnalysisStore] Failed to read error analysis config:',
        error
      )
    }
    cache = null
    return null
  }
}

async function writeStore(store: ErrorAnalysisConfigStore): Promise<void> {
  await writeFile(filePath, JSON.stringify(store, null, 2), { mode: 0o600 })
  cache = store
}

export async function getErrorAnalysisConfig(): Promise<ErrorAnalysisConfigInput | null> {
  const store = await readStore()

  if (!store) {
    return null
  }

  try {
    return {
      baseUrl: store.baseUrl,
      model: store.model,
      apiKey: decryptString(store.apiKey),
    }
  } catch (error) {
    log.warn(
      '[ErrorAnalysisStore] Failed to decrypt error analysis API key:',
      error
    )
    return null
  }
}

export async function getErrorAnalysisStatus(): Promise<ErrorAnalysisStatus> {
  const store = await readStore()

  return {
    configured: store !== null,
    baseUrl: store?.baseUrl ?? null,
    model: store?.model ?? null,
    useForAssistant: store?.useForAssistant ?? false,
  }
}

export async function saveErrorAnalysisConfig(
  config: ErrorAnalysisConfigInput
): Promise<void> {
  // Editing the endpoint or key must not silently move the Assistant back to
  // Grafana, so the existing choice is carried over.
  const existing = await readStore()

  await writeStore({
    version: '1.0',
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: encryptString(config.apiKey),
    useForAssistant: existing?.useForAssistant ?? false,
  })
}

/**
 * Ignored while unconfigured: there is nothing to point the Assistant at, and
 * clearing the config drops the flag with it (falling back to Grafana).
 */
export async function setUseForAssistant(value: boolean): Promise<void> {
  const store = await readStore()

  if (!store) {
    return
  }

  await writeStore({ ...store, useForAssistant: value })
}

export async function clearErrorAnalysisConfig(): Promise<void> {
  try {
    await unlink(filePath)
  } catch (error) {
    if (!isNodeJsErrnoException(error) || error.code !== 'ENOENT') {
      throw error
    }
  } finally {
    cache = null
  }
}
