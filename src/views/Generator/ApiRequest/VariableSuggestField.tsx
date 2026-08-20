import { Box, Card, Code, TextField } from '@radix-ui/themes'
import {
  ComponentProps,
  KeyboardEvent,
  Ref,
  SyntheticEvent,
  forwardRef,
  useRef,
  useState,
} from 'react'

import { getVariableQuery, insertVariable } from './variableSuggest'

type Props = ComponentProps<typeof TextField.Root> & {
  /** Correlation variable names that can be referenced from this field. */
  names: string[]
  /** Applies the completed value, e.g. `setValue(name, value)`. */
  onInsert: (value: string) => void
}

/**
 * Text field that suggests correlation variables while typing `{`. Selecting
 * one completes the placeholder in place instead of replacing the whole value,
 * so `Bearer {to` becomes `Bearer {token}`.
 */
export const VariableSuggestField = forwardRef<HTMLInputElement, Props>(
  function VariableSuggestField({ names, onInsert, ...props }, forwardedRef) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [query, setQuery] = useState<string | null>(null)
    const [activeIndex, setActiveIndex] = useState(0)

    const matches =
      query === null
        ? []
        : names.filter((name) =>
            name.toLowerCase().startsWith(query.toLowerCase())
          )

    const active = matches[Math.min(activeIndex, matches.length - 1)]

    function setRef(element: HTMLInputElement | null) {
      inputRef.current = element
      assignRef(forwardedRef, element)
    }

    // Covers typing, clicking elsewhere in the value and arrow keys alike.
    function syncQuery(event: SyntheticEvent<HTMLInputElement>) {
      const { value, selectionStart } = event.currentTarget

      setQuery(getVariableQuery(value, selectionStart ?? value.length))
      setActiveIndex(0)
    }

    function complete(name: string) {
      const element = inputRef.current

      if (!element) {
        return
      }

      const caret = element.selectionStart ?? element.value.length
      const next = insertVariable(element.value, caret, name)

      onInsert(next.value)
      setQuery(null)

      // `onInsert` writes through the form, so wait for the value to land.
      requestAnimationFrame(() =>
        element.setSelectionRange(next.caret, next.caret)
      )
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === 'Escape') {
        setQuery(null)
        return
      }

      if (matches.length === 0) {
        return
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setActiveIndex((index) => (index + 1) % matches.length)
          break
        case 'ArrowUp':
          event.preventDefault()
          setActiveIndex(
            (index) => (index - 1 + matches.length) % matches.length
          )
          break
        case 'Enter':
        case 'Tab':
          if (active !== undefined) {
            event.preventDefault()
            complete(active)
          }
          break
      }
    }

    return (
      <Box position="relative">
        <TextField.Root
          {...props}
          ref={setRef}
          role="combobox"
          aria-expanded={matches.length > 0}
          onInput={syncQuery}
          onClick={syncQuery}
          onKeyUp={syncQuery}
          onKeyDown={handleKeyDown}
          // Losing focus to the list itself is handled by `onMouseDown` below.
          onBlur={(event) => {
            setQuery(null)
            props.onBlur?.(event)
          }}
        />

        {matches.length > 0 && (
          <Card
            role="listbox"
            size="1"
            css={{
              position: 'absolute',
              zIndex: 10,
              left: 0,
              right: 0,
              marginTop: 'var(--space-1)',
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          >
            {matches.map((name) => (
              <Box
                key={name}
                role="option"
                aria-selected={name === active}
                // Fires before blur, so the value is still there to complete.
                onMouseDown={(event) => {
                  event.preventDefault()
                  complete(name)
                }}
                css={{
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-1)',
                  padding: 'var(--space-1)',
                  backgroundColor:
                    name === active ? 'var(--accent-a3)' : 'transparent',
                }}
              >
                <Code size="1" variant="ghost">{`{${name}}`}</Code>
              </Box>
            ))}
          </Card>
        )}
      </Box>
    )
  }
)

function assignRef(
  ref: Ref<HTMLInputElement>,
  element: HTMLInputElement | null
) {
  if (typeof ref === 'function') {
    ref(element)
    return
  }

  if (ref !== null) {
    ;(ref as { current: HTMLInputElement | null }).current = element
  }
}
