import * as monaco from 'monaco-editor'
import { useEffect } from 'react'

/**
 * Turns Monaco's JSON validation off while the request dialog is open.
 *
 * A `{name}` placeholder is deliberate, but it is not valid JSON, so the
 * linter marks every one of them - `Property keys must be doublequoted` on a
 * reference that is exactly right. `jsonBodyError` answers the same question
 * on the substituted body instead, where a placeholder is not an error and a
 * genuine mistake still is.
 *
 * The setting belongs to the `json` language rather than to one model, and the
 * request body is the app's only editable JSON editor, so it is restored on
 * unmount instead of being switched off for good.
 */
export function useJsonDiagnostics(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return
    }

    // `monaco.languages.json` is the deprecated alias and carries no types.
    const { jsonDefaults } = monaco.json
    const previous = jsonDefaults.diagnosticsOptions

    jsonDefaults.setDiagnosticsOptions({ ...previous, validate: false })

    return () => {
      jsonDefaults.setDiagnosticsOptions(previous)
    }
  }, [enabled])
}
