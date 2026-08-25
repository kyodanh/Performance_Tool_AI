import { z } from 'zod'

import { DEFAULT_GROUP_NAME } from '@/constants'

import { ApiRequestFormData, HTTP_METHODS, hasBody } from './ApiRequest.utils'

const KeyValueSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  disabled: z.boolean().optional(),
})

const CollectionSchema = z.object({
  // Parsed one by one below, so a single unsupported entry doesn't fail the file.
  item: z.array(z.unknown()),
  variable: KeyValueSchema.array().optional(),
})

// Environment exports use `values` / `enabled` instead of `variable` / `disabled`.
const EnvironmentSchema = z.object({
  values: z
    .object({
      key: z.string(),
      value: z.string().optional(),
      enabled: z.boolean().optional(),
    })
    .array(),
})

const RequestSchema = z.object({
  method: z.string().optional(),
  header: KeyValueSchema.array().optional(),
  url: z.union([z.string(), z.object({ raw: z.string() })]),
  body: z
    .object({
      mode: z.string().optional(),
      raw: z.string().optional(),
      urlencoded: KeyValueSchema.array().optional(),
    })
    .optional(),
})

type KeyValue = z.infer<typeof KeyValueSchema>
type PostmanRequest = z.infer<typeof RequestSchema>

export type PostmanVariables = Record<string, string>

export interface PostmanImport {
  requests: ApiRequestFormData[]
  /**
   * Requests we can't turn into a valid one: an undefined `{{variable}}`, a
   * method k6 Studio doesn't support, or a body mode we can't reproduce
   * (formdata, file).
   */
  skipped: number
}

/**
 * Reads the variables out of a Postman environment export, so `{{baseUrl}}` and
 * friends resolve for collections that keep them outside the collection file.
 * Returns null when the JSON isn't an environment.
 */
export function parsePostmanEnvironment(json: string): PostmanVariables | null {
  const environment = parseJson(EnvironmentSchema, json)

  if (environment === null) {
    return null
  }

  return Object.fromEntries(
    environment.values
      .filter(({ enabled }) => enabled !== false)
      .map(({ key, value = '' }) => [key, value])
  )
}

/**
 * Turns a Postman collection export (schema v2.x) into form data, so an
 * existing collection can be loaded instead of retyping every request.
 * Environment variables win over the collection's own, like in Postman.
 * Returns null when the JSON isn't a collection.
 */
export function parsePostman(
  json: string,
  environment: PostmanVariables = {}
): PostmanImport | null {
  const collection = parseJson(CollectionSchema, json)

  if (collection === null) {
    return null
  }

  // First match wins in `resolve`, so the environment comes first to override.
  const variables = [
    ...Object.entries(environment),
    ...enabled(collection.variable ?? []).map(
      ({ key, value = '' }) => [key, value] as const
    ),
  ]
  const resolve = (value: string) =>
    variables.reduce(
      (result, [key, replacement]) =>
        result.replaceAll(`{{${key}}}`, replacement),
      value
    )

  const requests: ApiRequestFormData[] = []
  let skipped = 0

  for (const { request: entry, group } of collectRequests(collection.item)) {
    const request = toApiRequest(entry, group, resolve)

    if (request === null) {
      skipped++
    } else {
      requests.push(request)
    }
  }

  return { requests, skipped }
}

function parseJson<T>(schema: z.ZodType<T>, json: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(json))

    return result.success ? result.data : null
  } catch {
    return null
  }
}

// Folders nest arbitrarily deep, each level holding `item` and/or `request`.
// The innermost folder name becomes the group, so a collection's structure
// shows up as `group()` calls in the script.
function collectRequests(
  items: unknown,
  group: string = DEFAULT_GROUP_NAME
): Array<{ request: unknown; group: string }> {
  if (!Array.isArray(items)) {
    return []
  }

  return items.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      return []
    }

    const { request, item: children, name } = item as Record<string, unknown>

    const childGroup =
      typeof name === 'string' && name.trim() !== '' ? name.trim() : group

    return [
      ...(request === undefined ? [] : [{ request, group }]),
      ...collectRequests(children, childGroup),
    ]
  })
}

function toApiRequest(
  entry: unknown,
  group: string,
  resolve: (value: string) => string
): ApiRequestFormData | null {
  const parsed = RequestSchema.safeParse(entry)

  if (!parsed.success) {
    return null
  }

  const { method: rawMethod = 'GET', url, body } = parsed.data
  const method = HTTP_METHODS.find((known) => known === rawMethod.toUpperCase())

  if (method === undefined) {
    return null
  }

  const resolvedUrl = resolve(typeof url === 'string' ? url : url.raw)

  if (!isHttpUrl(resolvedUrl)) {
    return null
  }

  const content = hasBody(method) ? toContent(body, resolve) : ''

  if (content === null) {
    return null
  }

  return {
    method,
    url: resolvedUrl,
    headers: toHeaders(parsed.data, resolve),
    content,
    group,
  }
}

function toHeaders(
  { header = [], body }: PostmanRequest,
  resolve: (value: string) => string
) {
  const headers = enabled(header)
    .filter(({ key }) => key.trim() !== '')
    .map(({ key, value = '' }) => ({ name: key.trim(), value: resolve(value) }))

  // Postman implies it from the body mode, `toRequest` would guess text/plain.
  if (
    body?.mode === 'urlencoded' &&
    !headers.some(({ name }) => name.toLowerCase() === 'content-type')
  ) {
    headers.push({
      name: 'content-type',
      value: 'application/x-www-form-urlencoded',
    })
  }

  return headers
}

// Null means the body can't be reproduced, so the request is skipped.
function toContent(
  body: PostmanRequest['body'],
  resolve: (value: string) => string
): string | null {
  switch (body?.mode) {
    case undefined:
    case 'raw':
      return resolve(body?.raw ?? '')

    case 'urlencoded':
      return enabled(body.urlencoded ?? [])
        .map(
          ({ key, value = '' }) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(resolve(value))}`
        )
        .join('&')

    default:
      return null
  }
}

function enabled<T extends KeyValue>(values: T[]) {
  return values.filter(({ disabled }) => disabled !== true)
}

function isHttpUrl(url: string) {
  try {
    const { protocol } = new URL(url)

    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
