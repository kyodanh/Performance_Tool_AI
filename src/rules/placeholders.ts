import { KeyValueTuple, ProxyData } from '@/types'
import { TestRule } from '@/types/rules'
import { Variable } from '@/types/testData'

import { correlationVariableName } from './correlation.utils'

/** A `{name}` typed by hand into a request URL, header value or body. */
const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g

export type PlaceholderExpressions = Map<string, string>

/**
 * Maps a placeholder name to the script expression it stands for. Only names
 * that exist are listed, so real braces in a JSON body and typos are left
 * alone instead of quietly becoming `undefined` at runtime.
 */
export function placeholderExpressions(
  variables: Variable[],
  rules: TestRule[]
): PlaceholderExpressions {
  const expressions: PlaceholderExpressions = new Map()

  for (const rule of rules) {
    if (rule.type !== 'correlation' || !rule.extractor.variableName) {
      continue
    }

    // Unnamed rules are `correlation_<n>` and the number is only known once the
    // rules run, so they cannot be referenced by hand.
    const name = correlationVariableName(rule, 0)
    expressions.set(name, `correlation_vars['${name}']`)
  }

  // Test data wins a name clash: it is named explicitly, while a correlation
  // rule's variable name is a byproduct of the rule.
  for (const { name } of variables) {
    if (name) {
      expressions.set(name, `VARS['${name}']`)
    }
  }

  return expressions
}

export function interpolatePlaceholders(
  value: string,
  expressions: PlaceholderExpressions
) {
  // A placeholder needs a brace, and most recorded text has none. Checking for
  // one is far cheaper than running the regex over every header and body of a
  // large recording, which happens on each edit in the rule editor.
  if (expressions.size === 0 || !value.includes('{')) {
    return value
  }

  return value.replace(PLACEHOLDER, (match, name: string) => {
    const expression = expressions.get(name)

    return expression === undefined ? match : `\${${expression}}`
  })
}

/** Rewrites every `{name}` a request carries into its script expression. */
export function interpolateRequestPlaceholders(
  data: ProxyData,
  expressions: PlaceholderExpressions
): ProxyData {
  if (expressions.size === 0) {
    return data
  }

  const { request } = data

  const url = interpolatePlaceholders(request.url, expressions)
  const content = request.content
    ? interpolatePlaceholders(request.content, expressions)
    : request.content

  let headersChanged = false
  const headers = request.headers.map(([name, value]): KeyValueTuple => {
    const interpolated = interpolatePlaceholders(value, expressions)

    if (interpolated !== value) {
      headersChanged = true
    }

    return [name, interpolated]
  })

  // Handing back the same object when nothing carried a placeholder is what
  // keeps the request list from re-rendering every row: `applyRules` runs over
  // the whole recording on each edit, and only the requests a rule really
  // rewrote should get a new identity. Assigning unconditionally - which is
  // what `produce` saw before - made that every request.
  if (!headersChanged && url === request.url && content === request.content) {
    return data
  }

  return {
    ...data,
    request: {
      ...request,
      url,
      headers,
      content,
    },
  }
}
