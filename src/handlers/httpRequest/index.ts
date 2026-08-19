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
        return {
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }
  )
}

function parseSetCookieHeaders(setCookie: string[]): Cookie[] {
  return setCookie.map((cookie) => {
    const [pair = ''] = cookie.split(';')
    const [name = '', ...value] = pair.split('=')

    return [name.trim(), value.join('=')]
  })
}
