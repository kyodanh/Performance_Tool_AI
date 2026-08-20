import { useMemo } from 'react'

import { correlationVariableName } from '@/rules/correlation.utils'
import { applyRules } from '@/rules/rules'
import { selectFilteredRequests, useGeneratorStore } from '@/store/generator'

/**
 * Correlation variables a manual request can reference as `{name}`, mapped to
 * the value the rule extracted from the recording. The value is what makes a
 * real `Send` possible; the script keeps using the variable.
 *
 * Only named rules are listed: an unnamed rule is called `correlation_<n>` and
 * the number is only known once the rules run.
 */
export function useCorrelationVariables() {
  const rules = useGeneratorStore((store) => store.rules)
  const requests = useGeneratorStore(selectFilteredRequests)

  return useMemo(() => {
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
  }, [requests, rules])
}
