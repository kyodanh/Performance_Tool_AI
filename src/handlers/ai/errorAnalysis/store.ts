import { app } from 'electron'
import log from 'electron-log/main'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { decryptString, encryptString } from '@/main/encryption'
import { readFile, writeFile } from '@/utils/fs'
import * as path from '@/utils/path'
import { isNodeJsErrnoException } from '@/utils/typescript'

import {
  AiProviderInput,
  ErrorAnalysisConfigInput,
  ErrorAnalysisStatus,
} from './types'

const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  /** Encrypted. */
  apiKey: z.string(),
})

const StoreSchema = z.object({
  version: z.literal('2.0'),
  providers: z.array(ProviderSchema),
  /** The provider AI features run on; null means the Grafana Assistant. */
  activeId: z.string().nullable(),
  useForAssistant: z.boolean(),
  typesafe: z
    .object({
      /** Encrypted. */
      apiKey: z.string(),
      enabled: z.boolean(),
    })
    .nullable(),
})

type Store = z.infer<typeof StoreSchema>

/** Files written before providers became a list held a single, active one. */
const LegacyStoreSchema = z
  .object({
    version: z.literal('1.0'),
    baseUrl: z.string(),
    model: z.string(),
    apiKey: z.string(),
    useForAssistant: z.boolean().optional(),
  })
  .transform(
    (legacy): Store => ({
      version: '2.0',
      providers: [
        {
          id: 'default',
          name: legacy.model,
          baseUrl: legacy.baseUrl,
          model: legacy.model,
          apiKey: legacy.apiKey,
        },
      ],
      activeId: 'default',
      useForAssistant: legacy.useForAssistant ?? false,
      typesafe: null,
    })
  )

const EMPTY_STORE: Store = {
  version: '2.0',
  providers: [],
  activeId: null,
  useForAssistant: false,
  typesafe: null,
}

const fileName =
  process.env.NODE_ENV === 'development'
    ? 'k6-studio-error-analysis-provider-dev.json'
    : 'k6-studio-error-analysis-provider.json'

const filePath = path.join(app.getPath('userData'), fileName)

let cache: Store | undefined

async function readStore(): Promise<Store> {
  if (cache !== undefined) {
    return cache
  }

  try {
    const file = await readFile(filePath, 'utf-8')
    cache = z.union([StoreSchema, LegacyStoreSchema]).parse(JSON.parse(file))
  } catch (error) {
    if (!isNodeJsErrnoException(error) || error.code !== 'ENOENT') {
      log.warn('[ErrorAnalysisStore] Failed to read AI provider config:', error)
    }
    cache = EMPTY_STORE
  }

  return cache
}

async function writeStore(store: Store): Promise<void> {
  await writeFile(filePath, JSON.stringify(store, null, 2), { mode: 0o600 })
  cache = store
}

function decrypt(value: string): string | null {
  try {
    return decryptString(value)
  } catch (error) {
    log.warn('[ErrorAnalysisStore] Failed to decrypt API key:', error)
    return null
  }
}

/** A saved provider's key, to reuse when the form leaves it blank. */
export async function getProviderApiKey(id: string): Promise<string | null> {
  const store = await readStore()
  const provider = store.providers.find((entry) => entry.id === id)

  return provider ? decrypt(provider.apiKey) : null
}

/** The active provider, or null to run on the Grafana Assistant. */
export async function getErrorAnalysisConfig(): Promise<ErrorAnalysisConfigInput | null> {
  const store = await readStore()
  const active = store.providers.find((entry) => entry.id === store.activeId)

  if (!active) {
    return null
  }

  const apiKey = decrypt(active.apiKey)

  return apiKey
    ? { baseUrl: active.baseUrl, model: active.model, apiKey }
    : null
}

export async function getErrorAnalysisStatus(): Promise<ErrorAnalysisStatus> {
  const store = await readStore()
  const active = store.providers.find((entry) => entry.id === store.activeId)

  return {
    configured: active !== undefined,
    baseUrl: active?.baseUrl ?? null,
    model: active?.model ?? null,
    useForAssistant: active !== undefined && store.useForAssistant,
    activeId: active?.id ?? null,
    providers: store.providers.map(({ id, name, baseUrl, model }) => ({
      id,
      name,
      baseUrl,
      model,
    })),
    typesafe: {
      configured: store.typesafe !== null,
      enabled: store.typesafe?.enabled ?? false,
      // Mirrors getTypesafeApiKey. It decrypts, so a key the keychain can no
      // longer read (the app was renamed) shows as off, not as working.
      source: store.typesafe
        ? store.typesafe.enabled && decrypt(store.typesafe.apiKey)
          ? 'settings'
          : null
        : process.env.TYPESAFE_API_KEY
          ? 'env'
          : null,
    },
  }
}

/**
 * Adds a provider (no `id`) or updates one, and makes it the active one —
 * saving a provider is choosing it.
 */
export async function saveProvider(
  input: AiProviderInput & { apiKey: string }
): Promise<void> {
  const store = await readStore()
  const id = input.id ?? randomUUID()
  const provider = {
    id,
    name: input.name,
    baseUrl: input.baseUrl,
    model: input.model,
    apiKey: encryptString(input.apiKey),
  }

  const exists = store.providers.some((entry) => entry.id === id)

  await writeStore({
    ...store,
    providers: exists
      ? store.providers.map((entry) => (entry.id === id ? provider : entry))
      : [...store.providers, provider],
    activeId: id,
  })
}

/** Deleting the active provider falls back to the Grafana Assistant. */
export async function deleteProvider(id: string): Promise<void> {
  const store = await readStore()

  await writeStore({
    ...store,
    providers: store.providers.filter((entry) => entry.id !== id),
    activeId: store.activeId === id ? null : store.activeId,
  })
}

/** null selects the Grafana Assistant. An unknown id is ignored. */
export async function setActiveProvider(id: string | null): Promise<void> {
  const store = await readStore()

  if (id !== null && !store.providers.some((entry) => entry.id === id)) {
    return
  }

  await writeStore({ ...store, activeId: id })
}

export async function setUseForAssistant(value: boolean): Promise<void> {
  const store = await readStore()

  await writeStore({ ...store, useForAssistant: value })
}

/** A blank `apiKey` keeps the saved one; null removes TypeSafe entirely. */
export async function saveTypesafeConfig(
  config: { apiKey?: string; enabled: boolean } | null
): Promise<void> {
  const store = await readStore()

  if (config === null) {
    await writeStore({ ...store, typesafe: null })
    return
  }

  const apiKey = config.apiKey
    ? encryptString(config.apiKey)
    : store.typesafe?.apiKey

  if (!apiKey) {
    return
  }

  await writeStore({
    ...store,
    typesafe: { apiKey, enabled: config.enabled },
  })
}

/**
 * The key error triage runs with. A key saved in Settings wins, and switching
 * it off there wins too; with none saved, `TYPESAFE_API_KEY` (shell or .env).
 */
export async function getTypesafeApiKey(): Promise<string | null> {
  const store = await readStore()

  if (store.typesafe === null) {
    return process.env.TYPESAFE_API_KEY || null
  }

  return store.typesafe.enabled ? decrypt(store.typesafe.apiKey) : null
}
