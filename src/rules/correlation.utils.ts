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

  // Default behavior replaces all occurrences of the string
  if (!rule.replacer?.selector) {
    return replaceAllTextMatches(withPlaceholders, extractedValue, varName)
  }

  return replaceRequestValues({
    selector: rule.replacer.selector,
    request: withPlaceholders,
    value: varName,
  })
}

function replaceAllTextMatches(
  request: Request,
  oldValue: string,
  newValue: string
): Request {
  const replaceAll: (request: Request) => Request = flow([
    (request: Request) => replaceAllBody(request, oldValue, newValue),
    (request: Request) => replaceAllUrl(request, oldValue, newValue),
    (request: Request) => replaceAllCookies(request, oldValue, newValue),
    (request: Request) => replaceAllHeader(request, oldValue, newValue),
  ])

  return replaceAll(request)
}
