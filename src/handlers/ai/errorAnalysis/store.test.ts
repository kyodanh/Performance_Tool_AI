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
const mockUnlink = vi.fn()

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
  unlink: mockUnlink,
}))

function enoent(): NodeJS.ErrnoException {
  const error = new Error('ENOENT') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  error.errno = -2
  error.syscall = 'open'
  return error
}

describe('saveErrorAnalysisConfig / getErrorAnalysisConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('encrypts the API key before writing and round-trips it back on read', async () => {
    const { saveErrorAnalysisConfig } = await import('./store')

    await saveErrorAnalysisConfig({
      baseUrl: 'https://example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'secret-key',
    })

    expect(mockEncryptString).toHaveBeenCalledWith('secret-key')

    const writtenJson = mockWriteFile.mock.calls[0]?.[1] as string
    const writtenData = JSON.parse(writtenJson) as { apiKey: string }
    expect(writtenData.apiKey).toBe('encrypted:secret-key')

    mockReadFile.mockResolvedValue(writtenJson)
    // saveErrorAnalysisConfig already primed the in-memory cache; re-import
    // to force a fresh read from the mocked file system.
    vi.resetModules()
    const fresh = await import('./store')

    const config = await fresh.getErrorAnalysisConfig()

    expect(config).toEqual({
      baseUrl: 'https://example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'secret-key',
    })
  })

  it('writes the config file with mode 0o600', async () => {
    const { saveErrorAnalysisConfig } = await import('./store')

    await saveErrorAnalysisConfig({
      baseUrl: 'https://example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'secret-key',
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { mode: 0o600 }
    )
  })

  it('returns null and does not throw when the config file does not exist', async () => {
    mockReadFile.mockRejectedValue(enoent())

    const { getErrorAnalysisConfig } = await import('./store')

    await expect(getErrorAnalysisConfig()).resolves.toBeNull()
  })

  it('returns null when the stored API key fails to decrypt', async () => {
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

describe('getErrorAnalysisStatus', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports configured: false without exposing the API key when unconfigured', async () => {
    mockReadFile.mockRejectedValue(enoent())

    const { getErrorAnalysisStatus } = await import('./store')

    await expect(getErrorAnalysisStatus()).resolves.toEqual({
      configured: false,
      baseUrl: null,
      model: null,
      useForAssistant: false,
    })
  })

  it('reports configured: true with baseUrl/model but no apiKey field', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        version: '1.0',
        baseUrl: 'https://example.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'encrypted:secret-key',
      })
    )

    const { getErrorAnalysisStatus } = await import('./store')
    const status = await getErrorAnalysisStatus()

    expect(status).toEqual({
      configured: true,
      baseUrl: 'https://example.com/v1',
      model: 'gpt-4o-mini',
      useForAssistant: false,
    })
    expect(status).not.toHaveProperty('apiKey')
  })
})

describe('clearErrorAnalysisConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes the config file', async () => {
    mockUnlink.mockResolvedValue(undefined)

    const { clearErrorAnalysisConfig } = await import('./store')

    await clearErrorAnalysisConfig()

    expect(mockUnlink).toHaveBeenCalledWith(expect.any(String))
  })

  it('does not throw when the file is already missing', async () => {
    mockUnlink.mockRejectedValue(enoent())

    const { clearErrorAnalysisConfig } = await import('./store')

    await expect(clearErrorAnalysisConfig()).resolves.toBeUndefined()
  })

  it('re-throws unexpected errors', async () => {
    const permissionError = new Error('EACCES') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockUnlink.mockRejectedValue(permissionError)

    const { clearErrorAnalysisConfig } = await import('./store')

    await expect(clearErrorAnalysisConfig()).rejects.toThrow('EACCES')
  })
})
