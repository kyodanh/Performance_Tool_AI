import { z } from 'zod'

import { DEFAULT_GROUP_NAME } from '@/constants'
import { SendHttpRequestOptions } from '@/handlers/httpRequest/types'
import { ProxyData, Request, Response } from '@/types'
import { getContentType } from '@/utils/headers'

export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const

export const ApiRequestSchema = z.object({
  method: z.enum(HTTP_METHODS),
  url: z.string().url({
    message: 'Enter a full URL, e.g. https://example.com/api/users',
  }),
  headers: z
    .object({
      name: z.string(),
      value: z.string(),
    })
    .array(),
  content: z.string(),
})

export type ApiRequestFormData = z.infer<typeof ApiRequestSchema>

export const DEFAULT_API_REQUEST: ApiRequestFormData = {
  method: 'GET',
  url: '',
  headers: [],
  content: '',
}

export function toRequest(
  { method, url, headers, content }: ApiRequestFormData,
  timing: Pick<Response, 'timestampStart' | 'timestampEnd'>
): Request {
  const parsedUrl = new URL(url)
  const body = hasBody(method) && content.trim() !== '' ? content : null

  const requestHeaders: Request['headers'] = headers
    .filter(({ name }) => name.trim() !== '')
    .map(({ name, value }) => [name.trim(), value])

  // Without it `fetch` sends `text/plain` and JSON APIs reject the body.
  if (body !== null && getContentType(requestHeaders) === undefined) {
    requestHeaders.push(['content-type', inferContentType(body)])
  }

  return {
    method,
    url,
    httpVersion: 'HTTP/1.1',
    headers: requestHeaders,
    query: [...parsedUrl.searchParams],
    cookies: [],
    content: body,
    contentLength: body?.length ?? 0,
    timestampStart: timing.timestampStart,
    timestampEnd: timing.timestampEnd,
    scheme: parsedUrl.protocol.replace(':', ''),
    host: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
  }
}

export function toSendOptions(
  data: ApiRequestFormData
): SendHttpRequestOptions {
  const { method, url, headers, content } = toRequest(data, {
    timestampStart: 0,
    timestampEnd: 0,
  })

  return { method, url, headers, content }
}

export function toProxyData(
  data: ApiRequestFormData,
  response: Response
): ProxyData {
  return {
    id: crypto.randomUUID(),
    request: toRequest(data, response),
    response,
    group: DEFAULT_GROUP_NAME,
  }
}

function inferContentType(body: string) {
  try {
    JSON.parse(body)
    return 'application/json'
  } catch {
    return 'text/plain'
  }
}

export function hasBody(method: ApiRequestFormData['method']) {
  return method !== 'GET' && method !== 'HEAD'
}
