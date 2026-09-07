import { createContext, useContext } from 'react'

import { ProxyData } from '@/types'
import { RuleInstance } from '@/types/rules'

/**
 * What the rows of the request list need but must not receive as props.
 *
 * Both values are rebuilt whenever the rules change, so passing them down would
 * change a prop on every row and re-render the whole list on each keystroke in
 * the rule editor. `selectedRuleInstance` used to arrive through a wrapper
 * component built per instance, which was worse still: a new component *type*
 * made React unmount and remount every group and row - thousands of DOM nodes
 * for a large recording.
 */
interface RequestListContextValue {
  /** The rule the editor has open, for the badges a row shows. */
  selectedRuleInstance?: RuleInstance
  /** The recorded requests before rules ran, by id. */
  originalRequests: Map<string, ProxyData>
}

const RequestListContext = createContext<RequestListContextValue>({
  originalRequests: new Map(),
})

export const RequestListProvider = RequestListContext.Provider

export function useSelectedRuleInstance() {
  return useContext(RequestListContext).selectedRuleInstance
}

/**
 * The recorded request a row was generated from. Read from context because a
 * row is one of a few hundred: selecting it from the store per row re-ran the
 * whole request filter - static asset checks and header parsing included - once
 * for every row on every store write.
 */
export function useOriginalRequestInList(id: string) {
  return useContext(RequestListContext).originalRequests.get(id)?.request
}
