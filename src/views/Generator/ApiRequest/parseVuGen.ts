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
  // LoadRunner's `web_add_cookie` writes to the VU's cookie jar, so the cookie
  // sticks to every later request until `web_cleanup_cookies` — it is not a
  // per-step header. Keyed by name so a re-add overwrites, like the jar does.
  const cookieJar = new Map<string, VuGenCookie>()
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

      case 'web_add_cookie': {
        const cookie = parseCookie(call.strings[0] ?? '')

        if (cookie !== null) {
          cookieJar.set(cookie.name, cookie)
        }
        break
      }

      case 'web_cleanup_cookies':
        cookieJar.clear()
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
          cookieJar,
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
        rendezvous = false
      }
    }
  }

  return { requests, skipped, droppedThinkTime }
}

interface RequestState {
  autoHeaders: Map<string, string>
  headers: Array<[string, string]>
  cookieJar: Map<string, VuGenCookie>
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

  const cookies = [...state.cookieJar.values()].filter((cookie) =>
    appliesToHost(cookie, new URL(url).hostname)
  )

  const headers = [
    ...state.autoHeaders,
    ...state.headers,
    ...(cookies.length > 0
      ? [
          [
            'Cookie',
            cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
          ] as [string, string],
        ]
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

interface VuGenCookie {
  name: string
  value: string
  /** `DOMAIN=` from the `web_add_cookie` string, null when it had none. */
  domain: string | null
}

/**
 * `web_add_cookie("name=value; DOMAIN=host; path=/; expires=...")` — only the
 * name, the value and the domain survive; k6 has no use for the rest.
 */
function parseCookie(cookie: string): VuGenCookie | null {
  const [pair, ...attributes] = cookie.split(';')
  const separator = pair?.indexOf('=') ?? -1

  if (pair === undefined || separator <= 0) {
    return null
  }

  const domain = attributes
    .map((attribute) => /^\s*domain\s*=\s*(.+?)\s*$/i.exec(attribute)?.[1])
    .find((value) => value !== undefined)

  return {
    name: pair.slice(0, separator).trim(),
    value: pair.slice(separator + 1).trim(),
    domain: domain ?? null,
  }
}

function appliesToHost(cookie: VuGenCookie, host: string): boolean {
  if (cookie.domain === null) {
    return true
  }

  const domain = cookie.domain.replace(/^\./, '')

  return host === domain || host.endsWith(`.${domain}`)
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)

    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
