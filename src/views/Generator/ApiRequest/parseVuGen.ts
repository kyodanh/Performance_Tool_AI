import { DEFAULT_GROUP_NAME } from '@/constants'
import { CorrelationRule, ExtractorSelector } from '@/types/rules'

import { ApiRequestFormData, HTTP_METHODS, hasBody } from './ApiRequest.utils'
import { FormField } from './formData'
import { Call, VuGenSubResource, readCalls } from './parseVuGen.tokenizer'

export interface VuGenRequest extends ApiRequestFormData {
  /** `lr_think_time` seconds to wait after this request, if the script had one. */
  thinkTime: number | null
  rendezvous: boolean
  /** The step was commented out: imported, but left out of the script. */
  disabled: boolean
}

export interface VuGenImport {
  requests: VuGenRequest[]
  /**
   * Steps we cannot turn into a request: a step with no parsable absolute URL,
   * a method k6 Studio does not support, or an `EXTRARES` sub-resource whose
   * URL will not resolve.
   */
  skipped: number
  /**
   * `EXTRARES` sub-resources imported as their own GET, inside the transaction
   * of the step that listed them — LoadRunner measures them there too.
   */
  subResources: number
  /**
   * `lr_think_time` calls that sit between two transactions. Our model can only
   * sleep *inside* a group, so keeping them would add their seconds to the
   * previous transaction's measured duration. Dropped instead of lying.
   */
  droppedThinkTime: number
  /**
   * `web_reg_save_param*` registrations turned back into correlation rules, so
   * a script exported from k6 Studio round-trips with its rules. They carry no
   * replacer: the imported requests already reference the value as `{name}`,
   * which `placeholderExpressions` resolves to the correlation variable.
   */
  correlations: CorrelationRule[]
  /**
   * `File=Yes` items imported as file fields without their content: the
   * script only names a path on the load generator. Attach it in Edit request.
   */
  missingFiles: number
}

const STEPS = ['web_url', 'web_custom_request', 'web_submit_data']

/**
 * The only commented-out calls read: a disabled step and the transaction it
 * sat in. Commented headers, cookies or params must not leak into live steps.
 */
const COMMENTED = [...STEPS, 'lr_start_transaction', 'lr_end_transaction']

/** `web_reg_save_param` is the pre-`_ex` spelling; both carry LB/RB. */
const SAVE_PARAM = [
  'web_reg_save_param_json',
  'web_reg_save_param_regexp',
  'web_reg_save_param_ex',
  'web_reg_save_param',
]

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
  let subResources = 0
  let droppedThinkTime = 0
  const correlations: CorrelationRule[] = []
  // A registration inspects the response of the step below it, so a rule
  // without its own `RequestUrl` filter waits here for that step's URL.
  let pendingCorrelations: CorrelationRule[] = []

  // VuGen steps read the state left by the calls above them.
  const autoHeaders = new Map<string, string>()
  let headers: Array<[string, string]> = []
  // LoadRunner's `web_add_cookie` writes to the VU's cookie jar, so the cookie
  // sticks to every later request until `web_cleanup_cookies` — it is not a
  // per-step header. Keyed by name so a re-add overwrites, like the jar does.
  const cookieJar = new Map<string, VuGenCookie>()
  // `lr_save_string` constants such as `{baseUrl}`. Only these names get
  // inlined; any other `{name}` is a correlation variable and stays as is.
  const params = new Map<string, string>()
  let group = DEFAULT_GROUP_NAME
  let rendezvous = false
  // The request a following `lr_think_time` may attach to — only ever one in
  // the transaction we are still inside.
  let thinkTimeTarget: VuGenRequest | null = null

  for (const raw of calls) {
    const call = expandParams(raw, params)

    if (call.commented && !COMMENTED.includes(call.name)) {
      continue
    }

    switch (call.name) {
      case 'lr_save_string':
        if (call.strings[1] !== undefined) {
          params.set(call.strings[1], call.strings[0] ?? '')
        }
        break

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
        if (SAVE_PARAM.includes(call.name)) {
          const rule = toCorrelationRule(call)

          if (rule !== null) {
            pendingCorrelations.push(rule)
          }
          break
        }

        if (!STEPS.includes(call.name)) {
          break
        }

        const state: RequestState = {
          autoHeaders,
          headers,
          cookieJar,
          group,
          rendezvous: rendezvous && !call.commented,
        }
        const request = toRequest(call, state)

        // A disabled step sees the state around it but leaves it alone: the
        // one-off headers, rendezvous and pending rules belong to the next
        // live step, as they do in LoadRunner.
        if (call.commented) {
          if (request !== null) {
            request.disabled = true
            requests.push(request)
            requests.push(
              ...call.extraResources.flatMap(
                (resource) => toSubResource(resource, request, state) ?? []
              )
            )
          }
          break
        }

        if (request === null) {
          skipped += 1 + call.extraResources.length
        } else {
          requests.push(request)
          thinkTimeTarget = request

          for (const rule of pendingCorrelations) {
            if (rule.extractor.filter.path === '') {
              rule.extractor.filter.path = request.url
            }

            correlations.push(rule)
          }

          pendingCorrelations = []

          // LoadRunner downloads these inside the same transaction, so their
          // time counts toward it. Leaving them out made every group measure
          // faster than the LoadRunner run it came from.
          for (const resource of call.extraResources) {
            const sub = toSubResource(resource, request, state)

            if (sub === null) {
              skipped += 1
              continue
            }

            requests.push(sub)
            subResources += 1
            // A pause after the step waits for the whole page, resources
            // included, so it attaches to the last of them.
            thinkTimeTarget = sub
          }
        }

        headers = []
        rendezvous = false
      }
    }
  }

  return {
    requests,
    skipped,
    subResources,
    droppedThinkTime,
    correlations: [...correlations, ...pendingCorrelations],
    missingFiles: requests
      .flatMap(({ formFields = [] }) => formFields)
      .filter(({ type, value }) => type === 'file' && value === '').length,
  }
}

/** Inlines `lr_save_string` values into every string the call carries. */
function expandParams(call: Call, params: Map<string, string>): Call {
  if (params.size === 0) {
    return call
  }

  const expand = (value: string) =>
    value.replace(
      /\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match, name: string) => params.get(name) ?? match
    )

  return {
    ...call,
    strings: call.strings.map(expand),
    options: new Map(
      [...call.options].map(([key, value]) => [key, expand(value)])
    ),
    itemData: call.itemData.map((item) => ({
      ...item,
      name: expand(item.name),
      value: expand(item.value),
    })),
    extraResources: call.extraResources.map((resource) => ({
      url: expand(resource.url),
      referer: resource.referer === null ? null : expand(resource.referer),
    })),
  }
}

/** Inverse of the `web_reg_save_param*` calls the VuGen export writes. */
function toCorrelationRule(call: Call): CorrelationRule | null {
  const variableName = call.options.get('ParamName')
  const selector = toExtractorSelector(call)

  if (variableName === undefined || selector === null) {
    return null
  }

  return {
    id: crypto.randomUUID(),
    type: 'correlation',
    enabled: true,
    extractor: {
      // The export wraps the filter in `*` because k6 Studio matches it as a
      // substring.
      filter: {
        path: (call.options.get('RequestUrl') ?? '').replace(/\*/g, ''),
      },
      selector,
      variableName,
      extractionMode: 'single',
    },
  }
}

function toExtractorSelector(call: Call): ExtractorSelector | null {
  const from = scope(call.options.get('Scope'))

  if (call.name === 'web_reg_save_param_json') {
    const path = call.options.get('QueryString')

    // A JSONPath `$['a']['b']` is read with `lodash.get`, which understands it
    // once the `$` is stripped — no conversion needed here.
    return path === undefined ? null : { type: 'json', from: 'body', path }
  }

  if (call.name === 'web_reg_save_param_regexp') {
    const regex = call.options.get('RegExp')

    return regex === undefined || !isValidRegex(regex)
      ? null
      : { type: 'regex', from, regex }
  }

  const begin = call.options.get('LB')
  const end = call.options.get('RB')

  if (begin === undefined || end === undefined) {
    return null
  }

  // How the export writes a header extraction: `"Name: "` up to the CRLF.
  if (from === 'headers' && end === '\r\n' && begin.endsWith(': ')) {
    return { type: 'header-name', from: 'headers', name: begin.slice(0, -2) }
  }

  return { type: 'begin-end', from, begin, end }
}

/** `Scope=All` is what the export writes for a URL selector. */
function scope(value: string | undefined): 'headers' | 'body' | 'url' {
  switch (value?.toLowerCase()) {
    case 'headers':
      return 'headers'
    case 'all':
      return 'url'
    default:
      return 'body'
  }
}

function isValidRegex(value: string): boolean {
  try {
    new RegExp(value)

    return true
  } catch {
    return false
  }
}

interface RequestState {
  autoHeaders: Map<string, string>
  headers: Array<[string, string]>
  cookieJar: Map<string, VuGenCookie>
  group: string
  rendezvous: boolean
}

function toRequest(call: Call, state: RequestState): VuGenRequest | null {
  // `web_submit_data` posts to `Action=`; its `URL=`, when present, is only
  // the page the form sat on.
  const url =
    call.name === 'web_submit_data'
      ? (call.options.get('Action') ?? call.options.get('URL'))
      : call.options.get('URL')

  if (url === undefined || toAbsoluteUrl(url) === null) {
    return null
  }

  const method = HTTP_METHODS.find(
    (value) => value === (call.options.get('Method') ?? 'GET').toUpperCase()
  )

  if (method === undefined) {
    return null
  }

  const headers = toHeaders(url, state)

  const formFields = hasBody(method) ? toFormFields(call) : null

  // `buildMultipart` writes the body and its boundary when the request is
  // built, so no content or content-type here.
  if (formFields !== null) {
    return {
      method,
      url,
      headers,
      content: '',
      bodyType: 'form-data',
      formFields,
      group: state.group,
      thinkTime: null,
      rendezvous: state.rendezvous,
      disabled: false,
    }
  }

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
    disabled: false,
  }
}

/**
 * An `EXTRARES` sub-resource as its own GET in the parent's transaction.
 *
 * ponytail: LoadRunner fetches these in parallel behind the page, we send them
 * in order — a group's duration reads as their sum, not their slowest. Switch
 * to `http.batch` in codegen if the timings have to line up with LoadRunner.
 */
function toSubResource(
  resource: VuGenSubResource,
  parent: VuGenRequest,
  state: RequestState
): VuGenRequest | null {
  // `Referer=` is the page the resource hangs off, which is what a relative
  // `Url=` resolves against; the parent step is only the fallback.
  const url = toAbsoluteUrl(resource.url, resource.referer ?? parent.url)

  if (url === null) {
    return null
  }

  return {
    method: 'GET',
    // `web_add_header` applies to the next step only, so a sub-resource gets
    // the auto headers and the cookie jar, never the parent's one-off headers.
    headers: [
      ...toHeaders(url, { ...state, headers: [] }),
      ...(resource.referer === null
        ? []
        : [{ name: 'Referer', value: resource.referer }]),
    ],
    url,
    content: '',
    group: parent.group,
    thinkTime: null,
    // `lr_rendezvous` releases the VU into the step below it, not into the
    // resources that step pulls.
    rendezvous: false,
    disabled: parent.disabled,
  }
}

function toHeaders(url: string, state: RequestState) {
  const cookies = [...state.cookieJar.values()].filter((cookie) =>
    appliesToHost(cookie, new URL(url).hostname)
  )

  return [
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
}

/** A multipart `web_submit_data` (or one with a file item) as form fields. */
function toFormFields(call: Call): FormField[] | null {
  const multipart =
    call.options.get('EncType')?.toLowerCase().includes('multipart') ||
    call.itemData.some(({ file }) => file)

  if (call.options.has('Body') || call.itemData.length === 0 || !multipart) {
    return null
  }

  return call.itemData.map(({ name, value, file, contentType }) =>
    file
      ? {
          name,
          type: 'file',
          value: '',
          fileName: value.split(/[\\/]/).pop() ?? '',
          contentType: contentType ?? '',
        }
      : { name, type: 'text', value, fileName: '', contentType: '' }
  )
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
      ({ name, value }) =>
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

/** Absolute URLs pass through unchanged; a relative one needs `base`. */
function toAbsoluteUrl(value: string, base?: string): string | null {
  try {
    const { protocol, href } = new URL(value, base)

    return protocol === 'http:' || protocol === 'https:' ? href : null
  } catch {
    return null
  }
}
