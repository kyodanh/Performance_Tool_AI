import log from 'electron-log/renderer'
import { useMemo } from 'react'

import { correlationVariableName } from '@/rules/correlation.utils'
import { applyRules } from '@/rules/rules'
import {
  GeneratorStore,
  selectFilteredRequests,
  useGeneratorStore,
} from '@/store/generator'
import { ProxyData } from '@/types'
import { TestRule } from '@/types/rules'
import { Variable } from '@/types/testData'
import { renderDataFileValue } from '@/utils/dataFile'

/**
 * Correlation variables a request can reference as `{name}`, mapped to the
 * value the rule extracted from the recording. The value is what makes a real
 * `Send` possible; the script keeps using the variable.
 *
 * Only named rules are listed: an unnamed rule is called `correlation_<n>` and
 * the number is only known once the rules run.
 */
function correlationVariables(requests: ProxyData[], rules: TestRule[]) {
  const values: Record<string, string | undefined> = {}

  for (const rule of rules) {
    if (rule.type === 'correlation' && rule.extractor.variableName) {
      values[correlationVariableName(rule, 0)] = undefined
    }
  }

  for (const instance of applyRules(requests, rules).ruleInstances) {
    if (instance.type !== 'correlation' || !instance.rule.enabled) {
      continue
    }

    const { extractedValue, generatedUniqueId } = instance.state

    if (extractedValue === undefined) {
      continue
    }

    values[correlationVariableName(instance.rule, generatedUniqueId ?? 0)] =
      extractedValue
  }

  return values
}

/**
 * Everything a request can reference as `{name}`: correlation variables plus
 * test data. A file-bound variable has no single value, so it stays undefined
 * and only the script resolves it.
 */
function requestVariables(
  requests: ProxyData[],
  rules: TestRule[],
  variables: Variable[]
) {
  const values = correlationVariables(requests, rules)

  for (const { name, value, file } of variables) {
    if (name) {
      values[name] = file ? undefined : value
    }
  }

  return values
}

/**
 * ponytail: for sending on click, so running every rule stays off the render
 * path of the rows that offer it.
 */
export function selectRequestVariables(state: GeneratorStore) {
  return requestVariables(
    selectFilteredRequests(state),
    state.rules,
    state.variables
  )
}

/**
 * First row of every bound data file, so a `Send` uses real data instead of
 * leaving `{name}` in the request. The first row is what iteration 0 of the
 * script gets, which makes the two agree.
 */
async function dataFileValues(variables: Variable[]) {
  const bound = variables.filter((variable) => variable.file !== undefined)
  const values: Record<string, string | undefined> = {}

  await Promise.all(
    [...new Set(bound.map((variable) => variable.file?.fileName))].map(
      async (fileName) => {
        if (fileName === undefined) {
          return
        }

        try {
          const content = await window.studio.fs.openFile(fileName)

          if (content.type !== 'data-file') {
            return
          }

          const [firstRow] = content.data.data

          for (const { name, file } of bound) {
            if (file?.fileName !== fileName) {
              continue
            }

            const value = renderDataFileValue(firstRow?.[file.propertyName])
            values[name] = value === null ? undefined : String(value)
          }
        } catch (error) {
          log.error(`Failed to read data file ${fileName}`, error)
        }
      }
    )
  )

  return values
}

/** Variables a `Send` can resolve, including the ones read from a data file. */
export async function resolveRequestVariables(state: GeneratorStore) {
  const values = selectRequestVariables(state)

  return { ...values, ...(await dataFileValues(state.variables)) }
}

/** For the request dialog, which lists the variables while you type. */
export function useRequestVariables() {
  const rules = useGeneratorStore((store) => store.rules)
  const requests = useGeneratorStore(selectFilteredRequests)
  const variables = useGeneratorStore((store) => store.variables)

  return useMemo(
    () => requestVariables(requests, rules, variables),
    [requests, rules, variables]
  )
}
