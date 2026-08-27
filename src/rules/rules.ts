import { produce } from 'immer'

import { ProxyData, RequestSnippetSchema } from '@/types'
import { TestRule } from '@/types/rules'
import { Variable } from '@/types/testData'

import { exhaustive } from '../utils/typescript'

import { createCorrelationRuleInstance } from './correlation'
import { createCustomCodeRuleInstance } from './customCode'
import { createParameterizationRuleInstance } from './parameterization'
import {
  interpolateRequestPlaceholders,
  placeholderExpressions,
} from './placeholders'
import { generateSequentialInt, urlToQueryParams } from './utils'
import { createVerificationRuleInstance } from './verification'

function createSequentialIdPool() {
  const currentId: Record<
    TestRule['type'],
    Generator<number, number, number>
  > = {
    correlation: generateSequentialInt(),
    parameterization: generateSequentialInt(),
    verification: generateSequentialInt(),
    customCode: generateSequentialInt(),
  }

  return (type: TestRule['type']) => currentId[type]
}

/**
 * `variables` lets hand-typed `{name}` placeholders resolve to test data. Pass
 * it wherever the result becomes a script; omit it when only rule effects are
 * inspected.
 */
export function applyRules(
  recording: ProxyData[],
  rules: TestRule[],
  variables: Variable[] = []
) {
  const idGenerator = createSequentialIdPool()
  const ruleInstances = rules
    .filter((rule) => rule.enabled)
    .map((rule) => createRuleInstance(rule, idGenerator(rule.type)))

  const expressions = placeholderExpressions(variables, rules)

  const requestSnippetSchemas = recording
    // Before the rules run: a placeholder is a variable reference the user
    // typed, not recorded text a rule should be matching against.
    .map((data) => interpolateRequestPlaceholders(data, expressions))
    .map((data) =>
      ruleInstances.reduce<RequestSnippetSchema>(
        (acc, rule) => rule.apply(acc),
        {
          data,
          before: [],
          after: [],
          checks: [],
        }
      )
    )
    // Update query params after all rules have been applied,
    // since some rules may change the URL
    .map(updateQueryParams)

  // Collect affected requests to exclude from redirect merging
  const affectedRequestIds = new Set(
    ruleInstances.flatMap((instance) => {
      if (['parameterization', 'customCode'].includes(instance.type)) {
        return instance.state.matchedRequestIds
      }

      if (instance.type === 'correlation') {
        return [
          ...instance.state.matchedRequestIds,
          ...instance.state.responsesExtracted.map((extracted) => extracted.id),
        ]
      }

      return []
    })
  )

  return { requestSnippetSchemas, ruleInstances, affectedRequestIds }
}

function createRuleInstance<T extends TestRule>(
  rule: T,
  idGenerator: Generator<number, number, number>
) {
  switch (rule.type) {
    case 'correlation':
      return createCorrelationRuleInstance(rule, idGenerator)
    case 'parameterization':
      return createParameterizationRuleInstance(rule, idGenerator)
    case 'verification':
      return createVerificationRuleInstance(rule)
    case 'customCode':
      return createCustomCodeRuleInstance(rule)

    default:
      return exhaustive(rule)
  }
}

function updateQueryParams(
  requestSnippet: RequestSnippetSchema
): RequestSnippetSchema {
  return produce(requestSnippet, (draft) => {
    draft.data.request.query = urlToQueryParams(draft.data.request.url)
  })
}
