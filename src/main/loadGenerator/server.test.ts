import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  networkInterfaces: () => ({
    en0: [
      { family: 'IPv4', internal: true, address: '127.0.0.1' },
      { family: 'IPv4', internal: false, address: '10.0.0.5' },
    ],
  }),
}))

vi.mock('@/utils/electron', () => ({
  getPlatform: () => 'mac',
  getArch: () => 'arm64',
  // Port 0 lets the OS pick a free one — the app under test may hold 7777.
  findOpenPort: () => Promise.resolve(0),
}))

// Importing the real client would pull in electron's `app`.
vi.mock('@/utils/k6/client', () => ({
  getK6ExecutablePath: () => '/nonexistent/k6',
}))

vi.mock('@/utils/resources', () => ({
  getResourcePath: (name: string) =>
    `${process.cwd()}/resources/loadGenerator/${
      name === 'load-generator-joiner-ps1' ? 'join.ps1' : 'join.sh'
    }`,
}))

const { startEnrollmentServer, stopEnrollmentServer } = await import('./server')
const { pool } = await import('./pool')

/**
 * One server for the whole file: restarting it on the same port between tests
 * leaves the HTTP client holding keep-alive sockets to the old one.
 */
let server: { base: string; key: string; url: string }

beforeAll(async () => {
  const { url, key } = await startEnrollmentServer()

  // The server binds every interface, so the loopback reaches the LAN address.
  server = { base: `http://127.0.0.1:${new URL(url).port}`, key, url }
})

afterAll(() => {
  stopEnrollmentServer()
})

afterEach(() => {
  for (const generator of pool.list()) {
    pool.leave(generator.id)
  }
})

describe('enrollment server', () => {
  it('serves a joiner with every placeholder filled in', async () => {
    const { base, key, url } = server

    const script = await (await fetch(`${base}/lg/${key}`)).text()

    expect(script).not.toMatch(/__CONTROLLER__|__KEY__|__K6_VERSION__/)
    expect(script).toContain(`CONTROLLER='${url}'`)
    expect(script).toContain(`KEY='${key}'`)
  })

  it('serves the PowerShell joiner when asked for Windows', async () => {
    const { base, key } = server

    const script = await (await fetch(`${base}/lg/${key}?os=windows`)).text()

    expect(script).toContain('$ErrorActionPreference')
  })

  it('refuses a wrong code', async () => {
    const { base } = server

    expect((await fetch(`${base}/lg/NOPE`)).status).toBe(403)
  })

  it('registers a generator under the address it sees', async () => {
    const { base, key } = server

    const response = await fetch(`${base}/lg/${key}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instance: 'instance-01',
        hostname: 'lg-01',
        user: 'loadtest',
        os: 'linux',
        arch: 'amd64',
        k6Version: 'k6 v2.1.0',
        nofile: '65535',
        ports: '10000-65535',
        clock: Math.round(Date.now() / 1000),
      }),
    })

    const { id, ip } = (await response.json()) as { id: string; ip: string }

    expect(ip).toBe('127.0.0.1')
    expect(pool.list()[0]?.id).toBe(id)

    const beat = (await (
      await fetch(`${base}/gen/${id}/beat`, { method: 'POST' })
    ).json()) as { stop: boolean; abort: boolean }

    expect(beat).toEqual({ stop: false, abort: false })
  })

  it('tells an unknown generator to stop instead of leaving it beating', async () => {
    const { base } = server

    const response = await fetch(`${base}/gen/gone/beat`, { method: 'POST' })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ stop: true })
  })

  it('does not serve a binary for another platform', async () => {
    const { base, key } = server

    const response = await fetch(`${base}/lg/${key}/k6?os=windows&arch=amd64`)

    expect(response.status).toBe(404)
  })
})
