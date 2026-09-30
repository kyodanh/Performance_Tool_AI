import { z } from 'zod'

import { isBinaryContent, isByteString } from '@/utils/format'

export const FormFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['text', 'file']),
  // A file's content: text as is, a binary file as one char per byte.
  value: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  // A file picked into the project's Data folder: the request keeps this path,
  // not the content, and the script reads the file with `open()`.
  path: z.string().optional(),
})

export type FormField = z.infer<typeof FormFieldSchema>

export const EMPTY_FORM_FIELD: FormField = {
  name: '',
  type: 'text',
  value: '',
  fileName: '',
  contentType: '',
}

/**
 * Stands in for a Data-folder file inside a multipart body, so the request
 * model can stay one string. Codegen turns it into `http.file(open(...))`, the
 * in-app send reads the file in its place.
 */
export const FILE_MARKER = /<<k6studio-file:([^>]+)>>/g

export function toFileMarker(path: string) {
  return `<<k6studio-file:${path}>>`
}

export function readFileMarker(value: string): string | null {
  return /^<<k6studio-file:([^>]+)>>$/.exec(value)?.[1] ?? null
}

/**
 * Points file fields an import could only name at a file of that name the
 * user already put in the Data folder, so it is not reported as missing again.
 */
export async function attachDataFiles(
  fields: FormField[]
): Promise<FormField[]> {
  return Promise.all(
    fields.map(async (field) => {
      if (field.type !== 'file' || field.path || field.value !== '') {
        return field
      }

      const path = await window.studio.data.findUploadFile(field.fileName)

      return path === null ? field : { ...field, path }
    })
  )
}

/** File fields that still have neither a Data folder file nor content. */
export function countMissingFiles(
  requests: Array<{ formFields?: FormField[] }>
) {
  return requests
    .flatMap(({ formFields = [] }) => formFields)
    .filter(({ type, path, value }) => type === 'file' && !path && value === '')
    .length
}

// ponytail: a file without `path` (from an older editor) is embedded in the
// script as is.

/**
 * The request model keeps a body as one string, the way recordings do. A body
 * with a binary file is a byte string (one char per byte) so the bytes survive
 * `btoa` in the script and the send, so its text parts are UTF-8 encoded too.
 * A body without one stays plain text, so `{variables}` in it still resolve.
 */
export function buildMultipart(
  fields: FormField[],
  boundary = `----k6StudioFormBoundary${crypto.randomUUID().replaceAll('-', '')}`
) {
  const parts = fields.filter(({ name }) => name.trim() !== '')

  if (parts.length === 0) {
    return null
  }

  const binary = parts.some(
    ({ type, value }) => type === 'file' && isBinaryContent(value)
  )
  const encode = (value: string) =>
    binary && !isBinaryContent(value) ? toByteString(value) : value

  const body = parts
    .map(({ name, type, value, fileName, contentType, path }) => {
      const disposition =
        type === 'file'
          ? `form-data; name="${quote(name)}"; filename="${quote(fileName)}"`
          : `form-data; name="${quote(name)}"`
      const head =
        type === 'file'
          ? `Content-Disposition: ${disposition}\r\nContent-Type: ${contentType || 'application/octet-stream'}`
          : `Content-Disposition: ${disposition}`

      const content =
        type === 'file' && path ? toFileMarker(path) : encode(value)

      return `--${boundary}\r\n${encode(head)}\r\n\r\n${content}\r\n`
    })
    .join('')

  return {
    body: `${body}--${boundary}--\r\n`,
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

/** Null when the body isn't multipart the editor can show as fields. */
export function parseMultipart(
  content: string,
  contentType: string
): FormField[] | null {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  const boundary = match?.[1] ?? match?.[2]?.trim()

  if (!boundary || !content.includes(`--${boundary}`)) {
    return null
  }

  const binary = isBinaryContent(content)
  const decode = (value: string) =>
    binary && !isBinaryContent(value) ? fromByteString(value) : value
  const fields: FormField[] = []

  for (const segment of content.split(`--${boundary}`).slice(1)) {
    if (segment.startsWith('--')) {
      break
    }

    // Recordings don't always keep the \r of a line break.
    const part = segment.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
    const separator = /\r?\n\r?\n/.exec(part)

    if (separator === null) {
      return null
    }

    const head = part.slice(0, separator.index)
    const value = part.slice(separator.index + separator[0].length)
    const name = /(?:^|;)\s*name="([^"]*)"/im.exec(head)?.[1]
    const fileName = /filename="([^"]*)"/i.exec(head)?.[1]

    if (name === undefined) {
      return null
    }

    const path = fileName === undefined ? null : readFileMarker(value)

    fields.push({
      name: decode(name),
      type: fileName === undefined ? 'text' : 'file',
      value: path === null ? decode(value) : '',
      ...(path === null ? {} : { path }),
      fileName: decode(fileName ?? ''),
      contentType: /^content-type:\s*(.*)$/im.exec(head)?.[1]?.trim() ?? '',
    })
  }

  return fields
}

// Per the HTML spec, which is what browsers send.
function quote(value: string) {
  return value
    .replaceAll('"', '%22')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
}

function decodeText(bytes: Uint8Array) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)

    return isBinaryContent(text) ? null : text
  } catch {
    return null
  }
}

function bytesToString(bytes: Uint8Array) {
  let result = ''

  for (const byte of bytes) {
    result += String.fromCharCode(byte)
  }

  return result
}

function toByteString(value: string) {
  return bytesToString(new TextEncoder().encode(value))
}

function fromByteString(value: string) {
  if (!isByteString(value)) {
    return value
  }

  return (
    decodeText(Uint8Array.from(value, (char) => char.charCodeAt(0))) ?? value
  )
}
