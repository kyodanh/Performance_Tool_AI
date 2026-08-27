import * as monaco from 'monaco-editor'
import { useEffect, useRef, useState } from 'react'

/** An unclosed `{` with at least one character typed, e.g. `{to|`. */
const OPEN_PLACEHOLDER = /\{([A-Za-z0-9_]+)$/

/**
 * Offers `{name}` completions inside one editor only. Monaco registers
 * providers per language, so the model is compared to keep the script and
 * response editors untouched.
 *
 * ponytail: a name has to be typed before the list opens, otherwise every `{`
 * of a JSON body would pop it up.
 */
export function useVariableCompletion(names: string[]) {
  const [model, setModel] = useState<monaco.editor.ITextModel | null>(null)
  const namesRef = useRef(names)
  namesRef.current = names

  useEffect(() => {
    if (!model) {
      return
    }

    // The model's own language, not a hardcoded one: the editor is created with
    // the options' language, which is not always the `defaultLanguage` prop.
    const provider = monaco.languages.registerCompletionItemProvider(
      model.getLanguageId(),
      {
        provideCompletionItems: (current, position) => {
          if (current.uri.toString() !== model.uri.toString()) {
            return { suggestions: [] }
          }

          const line = current.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          })

          const typed = line.match(OPEN_PLACEHOLDER)?.[1]

          if (typed === undefined) {
            return { suggestions: [] }
          }

          // Replace the `{` too, so accepting a suggestion cannot leave `{{name}`.
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - typed.length - 1,
            endColumn: position.column,
          }

          return {
            suggestions: namesRef.current.map((name) => ({
              label: `{${name}}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: `{${name}}`,
              filterText: `{${name}`,
              range,
            })),
          }
        },
      }
    )

    return () => provider.dispose()
  }, [model])

  return (editor: monaco.editor.IStandaloneCodeEditor) =>
    setModel(editor.getModel())
}
