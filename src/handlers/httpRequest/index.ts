import { ipcMain } from 'electron'

import { Cookie, Header } from '@/types'

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
          body: method === 'GET' || method === 'HEAD' ? undefined : content,
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
}
