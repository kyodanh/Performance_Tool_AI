/**
 * A `{name}` placeholder makes a JSON body invalid JSON, so Monaco's linter
 * flags every variable reference as an error - and a body full of those false
 * errors hides the real one. Substituting the placeholders first says whether
 * the body the server receives parses, which is the only question that matters.
 */
const PLACEHOLDER = /\{[A-Za-z0-9_]+\}/g

/** Any JSON value, so the substituted body stays parseable wherever it sits. */
const PLACEHOLDER_STAND_IN = '0'

/**
 * Only bodies that mean to be JSON are checked: the editor is also used for
 * form-encoded and plain-text payloads, which are not errors.
 */
function looksLikeJson(content: string) {
  const trimmed = content.trim()

  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

export function substitutePlaceholders(content: string) {
  return content.replace(PLACEHOLDER, PLACEHOLDER_STAND_IN)
}

/**
 * Why the body would not parse once its placeholders are resolved, or `null`
 * when it parses (or is not JSON at all).
 */
export function jsonBodyError(content: string): string | null {
  if (!looksLikeJson(content)) {
    return null
  }

  try {
    JSON.parse(substitutePlaceholders(content))
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
