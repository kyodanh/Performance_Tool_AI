import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockEncryptString = vi.fn((value: string) => `encrypted:${value}`)
const mockDecryptString = vi.fn((value: string) => {
  if (!value.startsWith('encrypted:')) {
    throw new Error('Decryption failed')
  }
  return value.replace('encrypted:', '')
})

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/k6-studio-test',
  },
}))

vi.mock('electron-log/main', () => ({
  default: { warn: vi.fn() },
}))

vi.mock('@/main/encryption', () => ({
  encryptString: mockEncryptString,
  decryptString: mockDecryptString,
}))

vi.mock('@/utils/fs', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}))

function enoent(): NodeJS.ErrnoException {
  const error = new Error('ENOENT') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  error.errno = -2
  error.syscall = 'open'
  return error
}

function writtenStore() {
  const calls = mockWriteFile.mock.calls
  return JSON.parse(calls[calls.length - 1]?.[1] as string) as {
    providers: { id: string; apiKey: string }[]
    activeId: string | null
    typesafe: { apiKey: string; enabled: boolean } | null
  }
}

const provider = {
  name: 'Gateway',
  baseUrl: 'https://example.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'secret-key',
}

describe('AI provider store', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockReadFile.mockRejectedValue(enoent())
    mockWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('encrypts the key, writes with mode 0o600 and round-trips the active provider', async () => {
    const { saveProvider } = await import('./store')

    await saveProvider(provider)

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { mode: 0o600 }
    )
    expect(writtenStore().providers[0]?.apiKey).toBe('encrypted:secret-key')

    mockReadFile.mockResolvedValue(mockWriteFile.mock.calls[0]?.[1])
    vi.resetModules()
    const fresh = await import('./store')

    await expect(fresh.getErrorAnalysisConfig()).resolves.toEqual({
      baseUrl: 'https://example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'secret-key',
    })
  })

  it('reports Grafana (not configured) without exposing any key when empty', async () => {
    const { getErrorAnalysisConfig, getErrorAnalysisStatus } =
      await import('./store')

    await expect(getErrorAnalysisConfig()).resolves.toBeNull()
    await expect(getErrorAnalysisStatus()).resolves.toEqual({
      configured: false,
      baseUrl: null,
      model: null,
      useForAssistant: false,
      activeId: null,
      providers: [],
      typesafe: { configured: false, enabled: false, source: null },
    })
  })

  it('keeps several providers, runs on the selected one, and falls back to Grafana when it is deleted', async () => {
    const store = await import('./store')

    await store.saveProvider(provider)
    await store.saveProvider({ ...provider, name: 'Local', model: 'llama' })

    let status = await store.getErrorAnalysisStatus()
    expect(status.providers.map((entry) => entry.name)).toEqual([
      'Gateway',
      'Local',
    ])
    // Saving selects.
    expect(status.model).toBe('llama')
    expect(JSON.stringify(status)).not.toContain('secret-key')

    const [first, second] = status.providers
    await store.setActiveProvider(first!.id)
    expect((await store.getErrorAnalysisConfig())?.model).toBe('gpt-4o-mini')

    await store.setActiveProvider('unknown')
    expect((await store.getErrorAnalysisStatus()).activeId).toBe(first!.id)

    await store.deleteProvider(first!.id)
    status = await store.getErrorAnalysisStatus()
    expect(status.configured).toBe(false)
    expect(status.providers.map((entry) => entry.id)).toEqual([second!.id])
  })

  it('never reports useForAssistant while Grafana is active', async () => {
    const store = await import('./store')

    await store.setUseForAssistant(true)
    expect((await store.getErrorAnalysisStatus()).useForAssistant).toBe(false)

    await store.saveProvider(provider)
    expect((await store.getErrorAnalysisStatus()).useForAssistant).toBe(true)
  })

  it('migrates a 1.0 file into an active provider', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        version: '1.0',
        baseUrl: 'https://example.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'encrypted:secret-key',
        useForAssistant: true,
      })
    )

    const store = await import('./store')

    await expect(store.getErrorAnalysisStatus()).resolves.toMatchObject({
      configured: true,
      model: 'gpt-4o-mini',
      useForAssistant: true,
      providers: [{ name: 'gpt-4o-mini' }],
    })
    await expect(store.getErrorAnalysisConfig()).resolves.toMatchObject({
      apiKey: 'secret-key',
    })
  })

  it('returns null when the active key fails to decrypt', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        version: '1.0',
        baseUrl: 'https://example.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'corrupted',
      })
    )

    const { getErrorAnalysisConfig } = await import('./store')

    await expect(getErrorAnalysisConfig()).resolves.toBeNull()
  })
})

describe('TypeSafe key', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockReadFile.mockRejectedValue(enoent())
    mockWriteFile.mockResolvedValue(undefined)
    vi.stubEnv('TYPESAFE_API_KEY', 'env-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses the environment until a key is saved, then the saved one, and nothing when disabled', async () => {
    const store = await import('./store')

    await expect(store.getTypesafeApiKey()).resolves.toBe('env-key')
    const source = async () =>
      (await store.getErrorAnalysisStatus()).typesafe.source
    expect(await source()).toBe('env')

    await store.saveTypesafeConfig({ apiKey: 'saved-key', enabled: true })
    expect(await source()).toBe('settings')
    expect(writtenStore().typesafe?.apiKey).toBe('encrypted:saved-key')
    await expect(store.getTypesafeApiKey()).resolves.toBe('saved-key')

    // Toggling without a key keeps the saved one.
    await store.saveTypesafeConfig({ enabled: false })
    await expect(store.getTypesafeApiKey()).resolves.toBeNull()
    expect(await source()).toBeNull()
    expect(writtenStore().typesafe?.apiKey).toBe('encrypted:saved-key')

    await store.saveTypesafeConfig(null)
    await expect(store.getTypesafeApiKey()).resolves.toBe('env-key')
  })
})
