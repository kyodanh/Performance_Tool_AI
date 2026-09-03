import { customAlphabet } from 'nanoid'
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http'
import { networkInterfaces } from 'os'
import { z } from 'zod'

import { LoadGeneratorFacts } from '@/types/loadGenerator'
import { getArch, getPlatform, findOpenPort } from '@/utils/electron'
import { createReadStream, exists, readFile } from '@/utils/fs'
import { getK6ExecutablePath } from '@/utils/k6/client'
import { getResourcePath } from '@/utils/resources'

import k6Versions from '../../../k6-versions.json'

import { pool } from './pool'
import {
  claimOrder,
  getArchivePath,
  markFinished,
  pushRemoteLines,
  shouldAbort,
} from './run'

const DEFAULT_PORT = 7777

// Ambiguous characters are left out so the code survives being read aloud or
// retyped from a screen.
const generateKey = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4)

/**
 * How long a code stays valid. Long enough to walk to another machine and paste
 * it, short enough that a code left on screen or in a chat log goes stale.
 */
const KEY_TTL_MS = 10 * 60 * 1000

interface RunningServer {
  server: Server
  /** Base URL the joiner is told to call back on, e.g. `http://10.0.0.5:7777`. */
  url: string
  key: string
  expiresAt: number
}

let running: RunningServer | null = null

/**
 * The address a generator on the LAN can reach us on. `localhost` is useless
 * here: the joiner runs on another machine.
 */
function getLanAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address
      }
    }
  }

  return null
}

/** IPv4 addresses arrive mapped into IPv6 (`::ffff:10.0.0.7`) on dual-stack sockets. */
function normalizeAddress(address: string | undefined): string {
  return (address ?? 'unknown').replace(/^::ffff:/, '')
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    request.on('error', reject)
  })
}

const SystemMetricsSchema = z.object({
  cpuPercent: z.number().min(0),
  cpuCount: z.number().int().min(0),
  memUsedBytes: z.number().min(0),
  memTotalBytes: z.number().min(0),
})

/**
 * A heartbeat carries the machine's CPU and memory, when the joiner could read
 * them. Anything that does not parse is dropped rather than failing the beat:
 * losing a sample matters far less than dropping the generator.
 */
async function readMetrics(request: IncomingMessage) {
  const body = await readBody(request).catch(() => '')

  let parsed: unknown

  try {
    parsed = JSON.parse(body === '' ? '{}' : body)
  } catch {
    return undefined
  }

  const result = SystemMetricsSchema.safeParse(parsed)

  if (!result.success) {
    return undefined
  }

  return { ...result.data, cpuPercent: Math.min(100, result.data.cpuPercent) }
}

function json(response: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)

  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

/**
 * Whether we hold the k6 binary a joiner asked for. Packaged builds only ship
 * the platform they were built for, so a mixed pool falls back to the GitHub
 * release — the joiner handles that itself.
 */
function servesBinaryFor(os: string, arch: string): boolean {
  const ownOs = { mac: 'macos', linux: 'linux', win: 'windows' }[getPlatform()]
  const ownArch = getArch() === 'arm64' ? 'arm64' : 'amd64'

  return os === ownOs && arch === ownArch
}

async function serveJoiner(
  response: ServerResponse,
  { url, key }: RunningServer,
  windows: boolean
) {
  const script = await readFile(
    getResourcePath(
      windows ? 'load-generator-joiner-ps1' : 'load-generator-joiner-sh'
    ),
    { encoding: 'utf-8' }
  )

  const filled = script
    .replaceAll('__CONTROLLER__', url)
    .replaceAll('__KEY__', key)
    .replaceAll('__K6_VERSION__', k6Versions.version)

  response.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(filled),
  })
  response.end(filled)
}

async function serveBinary(
  response: ServerResponse,
  params: URLSearchParams
): Promise<void> {
  const os = params.get('os') ?? ''
  const arch = params.get('arch') ?? ''
  const executable = getK6ExecutablePath()

  if (!servesBinaryFor(os, arch) || !(await exists(executable))) {
    json(response, 404, { error: `no bundled k6 for ${os}/${arch}` })

    return
  }

  response.writeHead(200, { 'content-type': 'application/octet-stream' })
  createReadStream(executable).pipe(response)
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  server: RunningServer
) {
  const { pathname, searchParams } = new URL(
    request.url ?? '/',
    'http://localhost'
  )

  const [, scope, first, second] = pathname.split('/')

  // Every joiner route is behind the enrollment key, so a stray request from the
  // LAN cannot enumerate the pool or hand us a generator we never invited.
  if (scope === 'lg') {
    if (first !== server.key || Date.now() > server.expiresAt) {
      json(response, 403, { error: 'invalid or expired code' })

      return
    }

    if (second === undefined) {
      const isPowerShell = /powershell|WindowsPowerShell/i.test(
        request.headers['user-agent'] ?? ''
      )

      await serveJoiner(
        response,
        server,
        searchParams.get('os') === 'windows' || isPowerShell
      )

      return
    }

    if (second === 'k6') {
      await serveBinary(response, searchParams)

      return
    }

    if (second === 'join' && request.method === 'POST') {
      const facts = JSON.parse(await readBody(request)) as LoadGeneratorFacts
      const ip = normalizeAddress(request.socket.remoteAddress)
      const generator = pool.join(facts, ip)

      json(response, 200, { id: generator.id, ip: generator.ip })

      return
    }
  }

  if (scope === 'gen' && first !== undefined) {
    // The archive is a plain download so the joiner can stream it to disk.
    if (second === 'archive' && request.method === 'GET') {
      const archive = getArchivePath(first)

      if (archive === null) {
        json(response, 404, { error: 'no run in progress' })

        return
      }

      response.writeHead(200, { 'content-type': 'application/x-tar' })
      createReadStream(archive).pipe(response)

      return
    }

    if (request.method !== 'POST') {
      json(response, 404, { error: 'not found' })

      return
    }

    if (second === 'beat') {
      const result = pool.beat(first, await readMetrics(request))

      // A generator we no longer know about is told to stop rather than left
      // beating into a void — the user most likely restarted the controller.
      json(
        response,
        result === null ? 404 : 200,
        result === null
          ? { stop: true }
          : { ...result, abort: shouldAbort(first) }
      )

      return
    }

    if (second === 'work') {
      json(response, 200, claimOrder(first) ?? {})

      return
    }

    // One long-lived request per generator streams k6's output as it is
    // produced, so nothing has to batch or buffer on the generator side.
    if (second === 'stats') {
      let pending = ''

      request.on('data', (chunk: Buffer) => {
        const lines = (pending + chunk.toString('utf-8')).split('\n')

        pending = lines.pop() ?? ''

        pushRemoteLines(first, lines)
      })

      request.on('end', () => {
        if (pending !== '') {
          pushRemoteLines(first, [pending])
        }

        // The stream only closes when k6 exits, so this is where a remote share
        // of the run finishes.
        markFinished(first)
        json(response, 200, {})
      })

      return
    }

    if (second === 'leave') {
      pool.leave(first)
      json(response, 200, {})

      return
    }
  }

  json(response, 404, { error: 'not found' })
}

/**
 * Starts the enrollment server if it is not already up and returns the details
 * the Add dialog shows. Idempotent: the same URL and code are handed out for the
 * lifetime of the app, so a code copied a minute ago still works.
 */
export async function startEnrollmentServer(): Promise<{
  url: string
  key: string
  expiresAt: number
}> {
  if (running !== null) {
    // A stale code is replaced rather than reported: the user opened the dialog
    // because they want to add a machine now.
    if (Date.now() > running.expiresAt) {
      running.key = generateKey()
      running.expiresAt = Date.now() + KEY_TTL_MS
    }

    return {
      url: running.url,
      key: running.key,
      expiresAt: running.expiresAt,
    }
  }

  const address = getLanAddress()

  if (address === null) {
    throw new Error(
      'No network interface found — connect to a network to add load generators.'
    )
  }

  const details: RunningServer = {
    server: createServer(),
    url: '',
    key: generateKey(),
    expiresAt: Date.now() + KEY_TTL_MS,
  }

  details.server.on('request', (request, response) => {
    handle(request, response, details).catch((error: Error) => {
      json(response, 500, { error: error.message })
    })
  })

  const port = await findOpenPort(DEFAULT_PORT)

  await new Promise<void>((resolve, reject) => {
    details.server.once('error', reject)
    details.server.listen(port, '0.0.0.0', resolve)
  })

  // Read the port back rather than trusting the one we asked for: `findOpenPort`
  // releases its probe socket before we bind, so something else can take it.
  const bound = details.server.address()

  details.url = `http://${address}:${
    typeof bound === 'object' && bound !== null ? bound.port : DEFAULT_PORT
  }`

  running = details

  return {
    url: details.url,
    key: details.key,
    expiresAt: details.expiresAt,
  }
}

export function stopEnrollmentServer() {
  // Joiners hold keep-alive connections between heartbeats, and `close` alone
  // waits for those to drain rather than shutting the port down.
  running?.server.closeAllConnections()
  running?.server.close()
  running = null
}
