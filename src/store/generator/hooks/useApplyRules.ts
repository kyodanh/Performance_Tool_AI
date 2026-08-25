import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { applyRules } from '@/rules/rules'

import { selectFilteredRequests } from '../selectors'
import { useGeneratorStore } from '../useGeneratorStore'

export function useApplyRules() {
  const rules = useGeneratorStore((state) => state.rules)
  const selectedRuleId = useGeneratorStore((state) => state.selectedRuleId)
  // Shallow, because the selector builds a new array every time: without it
  // any store write would recompute the rules and remount the request rows.
  const requests = useGeneratorStore(useShallow(selectFilteredRequests))

  const ruleApplicationResult = useMemo(
    () => applyRules(requests, rules),
    [requests, rules]
  )

  const selectedRuleInstance = useMemo(
    () =>
      ruleApplicationResult.ruleInstances.find(
        (ruleInstance) => ruleInstance.rule.id === selectedRuleId
      ),
    [ruleApplicationResult.ruleInstances, selectedRuleId]
  )

  const requestsWithRulesApplied = useMemo(
    () =>
      ruleApplicationResult.requestSnippetSchemas.map(
        (snippet) => snippet.data
      ),
    [ruleApplicationResult.requestSnippetSchemas]
  )

  return {
    selectedRuleInstance,
    requestsWithRulesApplied,
  }
}
