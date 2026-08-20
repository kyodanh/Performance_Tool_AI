/** An unclosed `{` before the caret, e.g. `Bearer {to|ken` -> `to`. */
const OPEN_PLACEHOLDER = /\{([A-Za-z0-9_]*)$/

/**
 * The name being typed inside `{`, or null when the caret is not in a
 * placeholder. A closed `{name}` stops matching, so the list hides again.
 */
export function getVariableQuery(value: string, caret: number) {
  return value.slice(0, caret).match(OPEN_PLACEHOLDER)?.[1] ?? null
}

/** Completes the placeholder the caret sits in, keeping the rest of the text. */
export function insertVariable(value: string, caret: number, name: string) {
  const before = value.slice(0, caret).replace(OPEN_PLACEHOLDER, '')
  const placeholder = `{${name}}`

  return {
    value: `${before}${placeholder}${value.slice(caret)}`,
    caret: before.length + placeholder.length,
  }
}
