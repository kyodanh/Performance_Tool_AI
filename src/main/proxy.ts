import { app } from 'electron'
import log from 'electron-log/main'
import find from 'find-process'
import forge from 'node-forge'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import readline from 'readline/promises'
import kill from 'tree-kill'

import * as path from '@/utils/path'

import { ProxyHandler } from '../handlers/proxy/types'
import { ProxyData } from '../types'
import { ProxySettings } from '../types/settings'
import {
  getPlatform,
  getArch,
  findOpenPort,
  broadcast,
  broadcastToast,
} from '../utils/electron'
import { exists, readFile } from '../utils/fs'
import { safeJsonParse } from '../utils/json'
import { toNativePath } from '../utils/path'

import { expandHomeDir } from './file'
export type ProxyProcess = ChildProcessWithoutNullStreams

interface options {
  onReady?: () => void
  onFailure?: () => void
}

export const launchProxy = (
  proxySettings: ProxySettings,
  { onReady, onFailure }: options = {}
): ProxyProcess => {
  let proxyScript: string
  let proxyPath: string
  const certificatesPath = getCertificatesPath()

  // if we are in dev server we take resources directly, otherwise look in the app resources folder.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    proxyScript = path.join(app.getAppPath(), 'resources', 'json_output.py')
    proxyPath = path.join(
      app.getAppPath(),
      'resources',
      getPlatform(),
      getArch(),
      'k6-studio-proxy'
    )
  } else {
    proxyScript = path.join(process.resourcesPath, 'json_output.py')
    // only the architecture directory will be in resources on the packaged app
    proxyPath = path.join(process.resourcesPath, getArch(), 'k6-studio-proxy')
  }

  // add .exe on windows
  proxyPath += getPlatform() === 'win' ? '.exe' : ''

  const proxyArgs = buildProxyArgs(proxySettings, {
    proxyScript,
    certificatesPath,
  })

  const proxy = spawn(toNativePath(proxyPath), proxyArgs)

  // we use a reader to read entire lines from stdout instead of buffered data
  const stdoutReader = readline.createInterface(proxy.stdout)

  stdoutReader.on('line', (data) => {
    // console.log(`stdout: ${data}`)

    if (data === 'Proxy Started~') {
      console.log(data)
      onReady?.()
      return
    }

    // TODO: add zod schema validation
    const proxyData = safeJsonParse<ProxyData>(data)
    if (proxyData) {
      broadcast(ProxyHandler.Data, proxyData)
    } else {
      // the proxy outputs some errors to stdout
      // example: [Errno 48] HTTP(S) proxy failed to listen on *:6001
      log.error(data)
    }
  })

  proxy.stderr.on('data', (data: Buffer) => {
    console.error(`stderr: ${data.toString()}`)
    log.error(data.toString())
  })

  proxy.on('close', (code) => {
    console.log(`proxy process exited with code ${code}`)

    // ponytail: the proxy starts before the first window exists, so "no windows"
    // no longer means "quitting" — only shutdown does. Returning on window count
    // swallowed every failure that happened during startup: no notification, no
    // retry, status stuck on 'starting' and nothing listening on the port.
    if (k6StudioState.appShuttingDown) {
      return
    }

    broadcast(ProxyHandler.Close, code)
    onFailure?.()
  })

  return proxy
}

export const buildProxyArgs = (
  proxySettings: ProxySettings,
  {
    proxyScript,
    certificatesPath,
  }: { proxyScript: string; certificatesPath: string }
) => {
  const proxyArgs = [
    '-q',
    '-s',
    toNativePath(proxyScript),
    '--set',
    `confdir=${toNativePath(certificatesPath)}`,
    '--listen-port',
    `${proxySettings.port}`,
    '--mode',
    getProxyMode(proxySettings),
    '--set',
    'validate_inbound_headers=false',
    // Open server connections only when a request is pending. With the
    // default eager strategy, mitmproxy pins one upstream socket to each
    // browser preconnect. Servers that close idle keep-alive connections
    // within seconds leave those tunnels half-dead, and requests sent on
    // them fail with "502 server closed connection".
    '--set',
    'connection_strategy=lazy',
  ]

  if (proxySettings.sslInsecure) {
    proxyArgs.push('--ssl-insecure')
  }

  if (proxySettings.mode === 'upstream' && proxySettings.requiresAuth) {
    const { username, password } = proxySettings
    proxyArgs.push('--upstream-auth', `${username}:${password}`)
  }

  if (proxySettings.mode === 'upstream' && proxySettings.certificatePath) {
    proxyArgs.push(
      '--set',
      `ssl_verify_upstream_trusted_ca=${toNativePath(proxySettings.certificatePath)}`
    )
  }

  return proxyArgs
}

const getProxyMode = (proxySettings: ProxySettings) => {
  if (proxySettings.mode === 'upstream') {
    return `upstream:${proxySettings.url}`
  }

  return 'regular'
}

export const getCertificatesPath = () => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return path.join(app.getAppPath(), 'resources', 'certificates')
  } else {
    return path.join(app.getPath('userData'), 'certificates')
  }
}

const getCertificateSPKI = async () => {
  const certificatePath = path.join(
    getCertificatesPath(),
    'mitmproxy-ca-cert.pem'
  )
  const certificatePem = await readFile(certificatePath, { encoding: 'utf-8' })

  const certificate = forge.pki.certificateFromPem(certificatePem)
  const spki = forge.pki.getPublicKeyFingerprint(certificate.publicKey, {
    type: 'SubjectPublicKeyInfo',
    md: forge.md.sha256.create(),
    encoding: 'binary',
  })

  // base64 encoded spki
  return forge.util.encode64(spki)
}

export const waitForProxy = async (): Promise<void> => {
  if (k6StudioState.proxyStatus === 'online') {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    k6StudioState.proxyEmitter.once('ready', () => {
      resolve()
    })
  })
}

export const launchProxyAndAttachEmitter = async () => {
  const PROXY_RETRY_LIMIT = 5
  const { port, automaticallyFindPort } = k6StudioState.appSettings.proxy

  const proxyPort = automaticallyFindPort ? await findOpenPort(port) : port
  k6StudioState.appSettings.proxy.port = proxyPort

  console.log(
    `launching proxy ${JSON.stringify(k6StudioState.appSettings.proxy)}`
  )

  k6StudioState.proxyEmitter.emit('status:change', 'starting')

  return launchProxy(k6StudioState.appSettings.proxy, {
    onReady: () => {
      k6StudioState.wasProxyStoppedByClient = false
      k6StudioState.proxyEmitter.emit('status:change', 'online')
      k6StudioState.proxyEmitter.emit('ready')
    },
    onFailure: async () => {
      // A proxy that dies before it ever came up leaves the status on
      // 'starting'. Nothing else corrects it, so a window opening afterwards
      // (the proxy starts before the first one exists) asks for the status and
      // is told the proxy is on its way when it is gone.
      const diedBeforeReady = k6StudioState.proxyStatus === 'starting'

      if (k6StudioState.wasProxyStoppedByClient || diedBeforeReady) {
        k6StudioState.proxyEmitter.emit('status:change', 'offline')
      }

      if (
        k6StudioState.appShuttingDown ||
        k6StudioState.wasProxyStoppedByClient ||
        diedBeforeReady
      ) {
        // don't restart the proxy if the app is shutting down, manually stopped by client or already restarting
        return
      }

      if (
        k6StudioState.proxyRetryCount === PROXY_RETRY_LIMIT &&
        !automaticallyFindPort
      ) {
        k6StudioState.proxyRetryCount = 0
        k6StudioState.proxyEmitter.emit('status:change', 'offline')

        broadcastToast({
          title: `Port ${proxyPort} is already in use`,
          description:
            'Please select a different port or enable automatic port selection',
          status: 'error',
        })

        return
      }

      k6StudioState.proxyRetryCount++
      k6StudioState.proxyEmitter.emit('status:change', 'starting')
      k6StudioState.currentProxyProcess = await launchProxyAndAttachEmitter()

      const errorMessage = `Proxy failed to start on port ${proxyPort}, restarting...`
      log.error(errorMessage)
      broadcastToast({
        title: errorMessage,
        status: 'error',
      })
    },
  })
}

export const stopProxyProcess = async () => {
  if (k6StudioState.currentProxyProcess) {
    k6StudioState.currentProxyProcess.kill()
    k6StudioState.currentProxyProcess = null

    // kill remaining proxies if any, this might happen on windows
    if (getPlatform() === 'win') {
      await cleanUpProxies()
    }
  }
}

export const cleanUpProxies = async () => {
  const processList = await find('name', 'k6-studio-proxy', false)

  // ponytail: `kill` is async — not waiting for it let the new proxy spawn
  // while the old one still held the port, so it died on "[Errno 48] failed to
  // listen" right after launch.
  await Promise.all(
    processList.map(
      (proc) => new Promise<void>((resolve) => kill(proc.pid, () => resolve()))
    )
  )
}

export const getProxyURL = () => {
  const { proxy } = k6StudioState.appSettings
  if (proxy.mode === 'upstream') {
    return proxy.url
  }
  return `http://localhost:${proxy.port}`
}

const getProxyCertificatePath = () => {
  const { proxy } = k6StudioState.appSettings
  if (proxy.mode === 'upstream') {
    return proxy.certificatePath
  }
  return path.join(getCertificatesPath(), 'mitmproxy-ca-cert.pem')
}

export const getProxyCertificateContent = async () => {
  const certPath = expandHomeDir(getProxyCertificatePath())

  if (!certPath) {
    return
  }

  if (await exists(certPath)) {
    return readFile(certPath)
  }

  return undefined
}

export async function getProxyArguments(
  settings: ProxySettings,
  options: { prefix: string } = { prefix: '--' }
): Promise<string[]> {
  const spki = await getCertificateSPKI()
  const port = settings.port

  return [
    `${options.prefix}proxy-server=http://localhost:${port}`,
    `${options.prefix}ignore-certificate-errors-spki-list=${spki}`,
  ]
}
