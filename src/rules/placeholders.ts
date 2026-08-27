import { produce } from 'immer'

import { ProxyData } from '@/types'
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
  if (expressions.size === 0) {
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

  return produce(data, (draft) => {
    const { request } = draft

    request.url = interpolatePlaceholders(request.url, expressions)
    request.headers = request.headers.map(([name, value]) => [
      name,
      interpolatePlaceholders(value, expressions),
    ])

    if (request.content) {
      request.content = interpolatePlaceholders(request.content, expressions)
    }
  })
}
