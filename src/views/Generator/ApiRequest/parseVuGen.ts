import { DEFAULT_GROUP_NAME } from '@/constants'

import { ApiRequestFormData, HTTP_METHODS, hasBody } from './ApiRequest.utils'
import { Call, readCalls } from './parseVuGen.tokenizer'

export interface VuGenRequest extends ApiRequestFormData {
  /** `lr_think_time` seconds to wait after this request, if the script had one. */
  thinkTime: number | null
  rendezvous: boolean
}

export interface VuGenImport {
  requests: VuGenRequest[]
  /**
   * Steps we cannot turn into a request: `EXTRARES` sub-resources, a step with
   * no parsable absolute URL, or a method k6 Studio does not support.
   */
  skipped: number
  /**
   * `lr_think_time` calls that sit between two transactions. Our model can only
   * sleep *inside* a group, so keeping them would add their seconds to the
   * previous transaction's measured duration. Dropped instead of lying.
   */
  droppedThinkTime: number
}

const STEPS = ['web_url', 'web_custom_request', 'web_submit_data']

/**
 * Turns a VuGen action (`Action.c`) into requests. LoadRunner scripts carry no
 * responses, so the result is request-only: correlation and recorded-value
 * assertions have nothing to read and must be added by hand afterwards.
 *
 * Returns null when the text holds no VuGen step at all.
 */
export function parseVuGen(source: string): VuGenImport | null {
  const calls = readCalls(source)

  if (!calls.some((call) => STEPS.includes(call.name))) {
    return null
  }

  const requests: VuGenRequest[] = []
  let skipped = 0
  let droppedThinkTime = 0

  // VuGen steps read the state left by the calls above them.
  const autoHeaders = new Map<string, string>()
  let headers: Array<[string, string]> = []
  let cookies: string[] = []
  let group = DEFAULT_GROUP_NAME
  let rendezvous = false
  // The request a following `lr_think_time` may attach to — only ever one in
  // the transaction we are still inside.
  let thinkTimeTarget: VuGenRequest | null = null

  for (const call of calls) {
    switch (call.name) {
      case 'lr_start_transaction':
        group = call.strings[0] ?? group
        thinkTimeTarget = null
        break

      case 'lr_end_transaction':
        group = DEFAULT_GROUP_NAME
        thinkTimeTarget = null
        break

      // ponytail: `web_add_auto_header` sticks to every later request,
      // `web_add_header` only to the next one. Verify against your VuGen
      // version if headers land on the wrong step.
      case 'web_add_auto_header':
        if (call.strings[0] !== undefined) {
          autoHeaders.set(call.strings[0], call.strings[1] ?? '')
        }
        break

      case 'web_remove_auto_header':
        autoHeaders.delete(call.strings[0] ?? '')
        break

      case 'web_cleanup_auto_headers':
        autoHeaders.clear()
        break

      case 'web_add_header':
        if (call.strings[0] !== undefined) {
          headers.push([call.strings[0], call.strings[1] ?? ''])
        }
        break

      case 'web_add_cookie':
        if (call.strings[0] !== undefined) {
          cookies.push(stripCookieAttributes(call.strings[0]))
        }
        break

      case 'lr_rendezvous':
        rendezvous = true
        break

      // The pause sits before the next step, our model waits *after* one.
      case 'lr_think_time': {
        const seconds = Number(call.words[0] ?? call.strings[0])

        if (!Number.isFinite(seconds)) {
          break
        }

        if (thinkTimeTarget === null) {
          droppedThinkTime += 1
          break
        }

        thinkTimeTarget.thinkTime = seconds
        break
      }

      default: {
        if (!STEPS.includes(call.name)) {
          break
        }

        skipped += call.extraResources

        const request = toRequest(call, {
          autoHeaders,
          headers,
          cookies,
          group,
          rendezvous,
        })

        if (request === null) {
          skipped += 1
        } else {
          requests.push(request)
          thinkTimeTarget = request
        }

        headers = []
        cookies = []
        rendezvous = false
      }
    }
  }

  return { requests, skipped, droppedThinkTime }
}

interface RequestState {
  autoHeaders: Map<string, string>
  headers: Array<[string, string]>
  cookies: string[]
  group: string
  rendezvous: boolean
}

function toRequest(call: Call, state: RequestState): VuGenRequest | null {
  const url = call.options.get('URL')

  if (url === undefined || !isAbsoluteUrl(url)) {
    return null
  }

  const method = HTTP_METHODS.find(
    (value) => value === (call.options.get('Method') ?? 'GET').toUpperCase()
  )

  if (method === undefined) {
    return null
  }

  const headers = [
    ...state.autoHeaders,
    ...state.headers,
    ...(state.cookies.length > 0
      ? [['Cookie', state.cookies.join('; ')] as [string, string]]
      : []),
  ].map(([name, value]) => ({ name, value }))

  const content = hasBody(method) ? body(call) : ''

  const encType = call.options.get('EncType')

  if (encType !== undefined && content !== '') {
    headers.push({ name: 'content-type', value: encType })
  }

  return {
    method,
    url,
    headers,
    content,
    group: state.group,
    thinkTime: null,
    rendezvous: state.rendezvous,
  }
}

/** `web_custom_request` carries a raw body, `web_submit_data` name/value pairs. */
function body(call: Call): string {
  const raw = call.options.get('Body')

  if (raw !== undefined) {
    return raw
  }

  if (call.itemData.length === 0) {
    return ''
  }

  return call.itemData
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
    )
    .join('&')
}

/** Keeps `name=value`, drops `DOMAIN=`, `path=`, `expires=` and friends. */
function stripCookieAttributes(cookie: string): string {
  return cookie.split(';')[0]?.trim() ?? ''
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)

    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
