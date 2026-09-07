import { KeyValueTuple, Request } from '@/types'
import { TextReplacement, TextSelector } from '@/types/rules'
import { exhaustive } from '@/utils/typescript'

/**
 * Where the extracted value goes in a `replaceWith` template: `{}`, or the
 * rule's own variable name in the `{name}` form used everywhere else in the
 * app - writing the name is the first thing people reach for, and leaving it
 * literal in the payload is never what they meant.
 */
const VALUE_SLOT = /\{[A-Za-z0-9_]*\}/g

/**
 * What the matched text turns into. A template keeps the text around the value
 * - `"id":2` searched and `"id":{}` replaced leaves the key and its quoting
 * alone, which a bare replacement cannot do since it consumes the whole match.
 * A template without a slot would drop the correlated value altogether, so it
 * is treated as no template at all.
 */
function replacement(pair: TextReplacement, value: string) {
  const template = pair.replaceWith

  if (template === undefined) {
    return value
  }

  // `replace` over `test`: a global regex carries `lastIndex` between `test`
  // calls, and an unchanged template is the same answer as no slot at all.
  const replaced = template.replace(VALUE_SLOT, value)

  return replaced === template ? value : replaced
}

/**
 * Every find/replace pair the selector carries, the first one included. An
 * empty search is skipped rather than matching everywhere: a pair the user
 * has only just added is empty until they type in it.
 */
function pairs(selector: TextSelector): TextReplacement[] {
  return [
    { value: selector.value, replaceWith: selector.replaceWith },
    ...(selector.replacements ?? []),
  ].filter((pair) => pair.value.trim() !== '')
}

export function replaceText(
  request: Request,
  selector: TextSelector,
  value: string
): Request {
  return pairs(selector).reduce((current, pair) => {
    const newValue = replacement(pair, value)

    switch (selector.from) {
      case 'body':
        return replaceAllBody(current, pair.value, newValue)

      case 'headers':
        return replaceAllHeader(current, pair.value, newValue)

      case 'url':
        return replaceAllUrl(current, pair.value, newValue)

      default:
        return exhaustive(selector.from)
    }
  }, request)
}

export function replaceAllBody(
  request: Request,
  oldValue: string,
  newValue: string
): Request {
  if (!request?.content?.includes(oldValue)) {
    return request
  }

  return {
    ...request,
    content: request.content.replaceAll(oldValue, newValue),
  }
}

export function replaceAllUrl(
  request: Request,
  oldValue: string,
  newValue: string
): Request {
  if (!request.url.includes(oldValue)) {
    return request
  }

  return {
    ...request,
    url: request.url.replaceAll(oldValue, newValue),
    path: request.path.replaceAll(oldValue, newValue),
    host: request.host.replaceAll(oldValue, newValue),
  }
}

export function replaceAllHeader(
  request: Request,
  oldValue: string,
  newValue: string,
  /** Header names to leave untouched, lower-cased. */
  skip?: (name: string) => boolean
): Request {
  const headerExists = request?.headers.find(
    ([name, value]) => value.includes(oldValue) && !skip?.(name.toLowerCase())
  )

  if (!headerExists) {
    return request
  }

  return {
    ...request,
    headers: request.headers.map(([key, headerValue]): KeyValueTuple => {
      if (skip?.(key.toLowerCase())) {
        return [key, headerValue]
      }

      return [key, headerValue.replaceAll(oldValue, newValue)]
    }),
  }
}

export function replaceAllCookies(
  request: Request,
  oldValue: string,
  newValue: string
): Request {
  const cookieExists = request?.cookies.find(([, value]) =>
    value.includes(oldValue)
  )

  if (!cookieExists) {
    return request
  }

  return {
    ...request,
    cookies: request.cookies.map(([key, cookieValue]) => {
      const replacedValue = cookieValue.replaceAll(oldValue, newValue)
      return [key, replacedValue]
    }),
  }
}
