import { z } from 'zod'

import { DEFAULT_GROUP_NAME } from '@/constants'
import { SendHttpRequestOptions } from '@/handlers/httpRequest/types'
import { ProxyData, Request, Response } from '@/types'
import {
  getContentType,
  getContentTypeWithCharsetHeader,
} from '@/utils/headers'
import { rawPath } from '@/utils/url'

import { FormFieldSchema, buildMultipart, parseMultipart } from './formData'
import { substitutePlaceholders } from './jsonBody'

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
  // Optional so the importers, which only produce raw bodies, can leave it out.
  bodyType: z.enum(['raw', 'form-data']).optional(),
  formFields: FormFieldSchema.array().optional(),
  // Free text: typing a name that doesn't exist yet creates the group.
  group: z.string(),
})

export type ApiRequestFormData = z.infer<typeof ApiRequestSchema>

export const DEFAULT_API_REQUEST: ApiRequestFormData = {
  method: 'GET',
  url: '',
  headers: [],
  content: '',
  bodyType: 'raw',
  formFields: [],
  group: DEFAULT_GROUP_NAME,
}

export function toRequest(
  {
    method,
    url,
    headers,
    content,
    bodyType,
    formFields = [],
  }: ApiRequestFormData,
  timing: Pick<Response, 'timestampStart' | 'timestampEnd'>
): Request {
  const parsedUrl = new URL(url)
  const multipart =
    hasBody(method) && bodyType === 'form-data'
      ? buildMultipart(formFields)
      : null
  const body = multipart
    ? multipart.body
    : hasBody(method) && bodyType !== 'form-data' && content.trim() !== ''
      ? content
      : null

  const requestHeaders: Request['headers'] = headers
    .filter(({ name }) => name.trim() !== '')
    // The boundary is new on every build, so a typed one would not match.
    .filter(
      ({ name }) => !multipart || name.trim().toLowerCase() !== 'content-type'
    )
    .map(({ name, value }) => [name.trim(), value])

  if (multipart) {
    requestHeaders.push(['content-type', multipart.contentType])
  }

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
    path: rawPath(url),
  }
}

export function fromProxyData({
  request,
  group,
}: ProxyData): ApiRequestFormData {
  const method = HTTP_METHODS.find((value) => value === request.method)
  const contentType = getContentTypeWithCharsetHeader(request.headers) ?? ''
  const formFields =
    request.content && contentType.includes('multipart/form-data')
      ? parseMultipart(request.content, contentType)
      : null
  const headers = request.headers.map(([name, value]) => ({ name, value }))

  if (formFields !== null) {
    return {
      method: method ?? 'GET',
      url: request.url,
      // Built again from the fields, with a fresh boundary.
      headers: headers.filter(
        ({ name }) => name.toLowerCase() !== 'content-type'
      ),
      content: '',
      bodyType: 'form-data',
      formFields,
      group: group || DEFAULT_GROUP_NAME,
    }
  }

  return {
    method: method ?? 'GET',
    url: request.url,
    headers,
    content: request.content ?? '',
    bodyType: 'raw',
    formFields: [],
    group: group || DEFAULT_GROUP_NAME,
  }
}

/**
 * `variables` maps a correlation variable name to the value recorded for it.
 * Placeholders are resolved for the request that goes out so it can actually
 * succeed, while the form keeps `{name}` for the generated script.
 */
export function toSendOptions(
  data: ApiRequestFormData,
  variables: Record<string, string | undefined> = {}
): SendHttpRequestOptions {
  const { method, url, headers, content } = toRequest(
    resolvePlaceholders(data, variables),
    {
      timestampStart: 0,
      timestampEnd: 0,
    }
  )

  return { method, url, headers, content }
}

export function resolvePlaceholders(
  data: ApiRequestFormData,
  variables: Record<string, string | undefined>
): ApiRequestFormData {
  const entries = Object.entries(variables).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )

  const resolve = (value: string) =>
    entries.reduce(
      (result, [name, recorded]) => result.replaceAll(`{${name}}`, recorded),
      value
    )

  return {
    ...data,
    url: resolve(data.url),
    headers: data.headers.map((header) => ({
      ...header,
      value: resolve(header.value),
    })),
    content: resolve(data.content),
    // Files are left alone: a placeholder in one is data, not a reference.
    formFields: data.formFields?.map((field) =>
      field.type === 'text' ? { ...field, value: resolve(field.value) } : field
    ),
  }
}

export function toProxyData(
  data: ApiRequestFormData,
  // Imported requests have no response until they are sent.
  response?: Response,
  // Editing an existing request keeps its id so rules keep pointing at it.
  id: string = crypto.randomUUID()
): ProxyData {
  return {
    id,
    request: toRequest(
      data,
      response ?? { timestampStart: 0, timestampEnd: 0 }
    ),
    response,
    group: data.group.trim() || DEFAULT_GROUP_NAME,
  }
}

function inferContentType(body: string) {
  try {
    // Placeholders first: a JSON body referencing `{name}` is still JSON, and
    // calling it `text/plain` is what makes the API reject it.
    JSON.parse(substitutePlaceholders(body))
    return 'application/json'
  } catch {
    return 'text/plain'
  }
}

export function hasBody(method: ApiRequestFormData['method']) {
  return method !== 'GET' && method !== 'HEAD'
}
