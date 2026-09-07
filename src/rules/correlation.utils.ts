import { flow } from 'lodash-es'

import { Request } from '@/types'
import { CorrelationRule } from '@/types/rules'

import { replaceRequestValues } from './selectors'
import {
  replaceAllBody,
  replaceAllCookies,
  replaceAllHeader,
  replaceAllUrl,
} from './selectors/text'

/**
 * Name the extracted value is stored under: `correlation_vars['<name>']` in k6,
 * the VuGen `ParamName` and the JMeter reference name. Falls back to the
 * generated id when the rule has no name of its own.
 *
 * ponytail: unsafe characters are replaced rather than rejected, so loading an
 * older generator file (or an AI-suggested name like `pizza.id`) never fails.
 * Duplicate names across rules collide — same as a duplicate VuGen ParamName.
 */
export function correlationVariableName(
  rule: CorrelationRule,
  uniqueId: number
) {
  const custom = rule.extractor.variableName

  return (
    (custom === undefined ? '' : sanitizeVariableName(custom)) ||
    `correlation_${uniqueId}`
  )
}

export function sanitizeVariableName(name: string) {
  return name.trim().replace(/[^A-Za-z0-9_]/g, '_')
}

/**
 * Headers the client writes about itself, never a server-issued value. They are
 * full of short numbers (`Chrome/141.0.0.0`, `AppleWebKit/537.36`) that a plain
 * substring match happily corrupts, so the automatic replacer skips them.
 * An explicit replacer selector still reaches them - that is a deliberate ask.
 */
const NON_CORRELATABLE_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'content-length',
  'content-type',
  'dnt',
  'pragma',
  'priority',
  'sec-ch-ua',
  'sec-ch-ua-arch',
  'sec-ch-ua-bitness',
  'sec-ch-ua-full-version',
  'sec-ch-ua-full-version-list',
  'sec-ch-ua-mobile',
  'sec-ch-ua-model',
  'sec-ch-ua-platform',
  'sec-ch-ua-platform-version',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'te',
  'upgrade-insecure-requests',
  'user-agent',
])

const isNonCorrelatableHeader = (name: string) =>
  NON_CORRELATABLE_HEADERS.has(name)

/**
 * Shorter than this, an extracted value matches by accident far more often than
 * on purpose - a `7` lifted out of an id turns `537.36` into a variable. Such a
 * value is still replaced where a replacer selector points at it explicitly.
 */
const MIN_AUTO_REPLACE_LENGTH = 4

function isSafeToReplaceEverywhere(value: string) {
  return value.trim().length >= MIN_AUTO_REPLACE_LENGTH
}

/**
 * `extractedValue` is typed as a string, but a JSON extractor hands back
 * whatever the body held - a number, a boolean, an array (see #277). The
 * replacers coerce it anyway when matching, so coerce once, up front.
 */
function toSearchValue(value: string): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

export function replaceCorrelatedValues({
  rule,
  extractedValue,
  uniqueId,
  request,
}: {
  rule: CorrelationRule
  extractedValue: string
  uniqueId: number
  request: Request
}): Request {
  const name = correlationVariableName(rule, uniqueId)
  const varName = `\${correlation_vars['${name}']}`

  // `{name}` placeholders typed by hand (VuGen habit) address the same value.
  // Only the rule's own name is substituted, so JSON braces in a body are left
  // alone. Requests sent before the extraction keep the literal placeholder,
  // which is how the preview shows that the reference came too early.
  const withPlaceholders = replaceAllTextMatches(request, `{${name}}`, varName)

  if (rule.replacer?.selector) {
    return replaceRequestValues({
      selector: rule.replacer.selector,
      request: withPlaceholders,
      value: varName,
    })
  }

  // Default behavior replaces all occurrences of the string, minus the places
  // where a match cannot be the extracted value.
  const searchValue = toSearchValue(extractedValue)

  if (!isSafeToReplaceEverywhere(searchValue)) {
    return withPlaceholders
  }

  return replaceAllTextMatches(withPlaceholders, searchValue, varName, {
    skipHeader: isNonCorrelatableHeader,
  })
}

function replaceAllTextMatches(
  request: Request,
  oldValue: string,
  newValue: string,
  { skipHeader }: { skipHeader?: (name: string) => boolean } = {}
): Request {
  const replaceAll: (request: Request) => Request = flow([
    (request: Request) => replaceAllBody(request, oldValue, newValue),
    (request: Request) => replaceAllUrl(request, oldValue, newValue),
    (request: Request) => replaceAllCookies(request, oldValue, newValue),
    (request: Request) =>
      replaceAllHeader(request, oldValue, newValue, skipHeader),
  ])

  return replaceAll(request)
}
