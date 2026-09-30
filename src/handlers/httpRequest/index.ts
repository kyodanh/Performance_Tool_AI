import { ipcMain } from 'electron'

import { Cookie, Header } from '@/types'
import { isBinaryContent, isByteString } from '@/utils/format'
import { readFile } from '@/utils/fs'
import * as path from '@/utils/path'
import { FILE_MARKER } from '@/views/Generator/ApiRequest/formData'

import {
  HttpRequestHandler,
  SendHttpRequestOptions,
  SendHttpRequestResult,
} from './types'

const REQUEST_TIMEOUT = 30_000

export function initialize() {
  ipcMain.handle(
    HttpRequestHandler.Send,
    async (
      _,
      { method, url, headers, content }: SendHttpRequestOptions
    ): Promise<SendHttpRequestResult> => {
      console.info(`${HttpRequestHandler.Send} event received`)

      const timestampStart = Date.now() / 1000

      try {
        const response = await fetch(url, {
          method,
          headers,
          body:
            method === 'GET' || method === 'HEAD'
              ? undefined
              : await toBody(content),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        })

        const responseContent = await response.text()

        return {
          type: 'success',
          response: {
            statusCode: response.status,
            reason: response.statusText,
            // fetch doesn't expose the negotiated protocol version.
            // ponytail: hardcoded, only used for display
            httpVersion: 'HTTP/1.1',
            headers: [...response.headers] as Header[],
            cookies: parseSetCookieHeaders(response.headers.getSetCookie()),
            content: responseContent,
            contentLength: responseContent.length,
            timestampStart,
            timestampEnd: Date.now() / 1000,
            path: '',
          },
        }
      } catch (error) {
        return { type: 'error', message: describeError(error) }
      }
    }
  )
}

/**
 * `fetch` reports every network failure as a bare "fetch failed"; the reason
 * (ENOTFOUND, self-signed certificate, ECONNREFUSED) only lives on `cause`.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }

  const { cause } = error

  if (cause === undefined || cause === null) {
    return error.message
  }

  const causeMessage = describeError(cause)

  return causeMessage === error.message
    ? error.message
    : `${error.message}: ${causeMessage}`
}

/**
 * A binary body (a file in a multipart upload) is a byte string, one char per
 * byte. Sent as a string, fetch would UTF-8 encode it and corrupt the file.
 */
async function toBody(content: string | null) {
  if (content !== null && content.match(FILE_MARKER) !== null) {
    // Loaded here: `workspace` reads the Electron app at import time.
    const { getDataFilesPath } = await import('@/constants/workspace')

    return withDataFiles(content, getDataFilesPath())
  }

  return content !== null && isBinaryContent(content) && isByteString(content)
    ? Buffer.from(content, 'latin1')
    : content
}

/** Swaps each Data-folder file marker for the file's bytes. */
async function withDataFiles(content: string, dataFilesPath: string) {
  const dataDir = path.resolve(dataFilesPath)
  const chunks: Buffer[] = []
  let last = 0

  for (const match of content.matchAll(FILE_MARKER)) {
    const filePath = path.resolve(match[1] ?? '')

    // The body comes from the renderer: only ever read the project's Data folder.
    // `pathe` always joins with `/`; `key` folds case where the disk does.
    if (!path.key(filePath).startsWith(`${path.key(dataDir)}/`)) {
      throw new Error(`Upload file is outside the Data folder: ${filePath}`)
    }

    chunks.push(Buffer.from(content.slice(last, match.index), 'utf8'))
    chunks.push(await readFile(filePath))
    last = match.index + match[0].length
  }

  chunks.push(Buffer.from(content.slice(last), 'utf8'))

  return Buffer.concat(chunks)
}

function parseSetCookieHeaders(setCookie: string[]): Cookie[] {
  return setCookie.map((cookie) => {
    const [pair = ''] = cookie.split(';')
    const [name = '', ...value] = pair.split('=')

    return [name.trim(), value.join('=')]
  })
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest

  describe('describeError', () => {
    it('appends the cause of an opaque fetch failure', () => {
      const error = new TypeError('fetch failed', {
        cause: new Error('getaddrinfo ENOTFOUND example.invalid'),
      })

      expect(describeError(error)).toBe(
        'fetch failed: getaddrinfo ENOTFOUND example.invalid'
      )
    })

    it('keeps a message without a cause as is', () => {
      expect(describeError(new Error('The operation timed out'))).toBe(
        'The operation timed out'
      )
    })

    it('handles a non-error throw', () => {
      expect(describeError('boom')).toBe('boom')
    })
  })

  describe('withDataFiles', async () => {
    const { mkdtemp, writeFile } = await import('@/utils/fs')
    const { tmpdir } = await import('os')
    const dir = await mkdtemp(path.join(tmpdir(), 'k6studio-upload-'))
    const file = path.join(dir, 'a.bin')
    await writeFile(file, Buffer.from([0, 255, 1]))

    it('puts the file bytes where the marker was', async () => {
      const body = await withDataFiles(`x<<k6studio-file:${file}>>é`, dir)

      expect([...body]).toEqual([0x78, 0, 255, 1, 0xc3, 0xa9])
    })

    it('refuses a file outside the Data folder', async () => {
      await expect(
        withDataFiles(`<<k6studio-file:${dir}/../etc/passwd>>`, dir)
      ).rejects.toThrow('outside the Data folder')
    })
  })
}
