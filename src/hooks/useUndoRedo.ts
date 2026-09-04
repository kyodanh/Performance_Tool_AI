import { useEffect, useRef } from 'react'

import { EditAction } from '@/handlers/ui/types'

/** Returns true when the view handled the action itself. */
type EditActionHandler = (action: EditAction) => boolean

// The view mounted last gets the menu action first, the way a stack of dialogs
// would - a nested view is what the user is looking at.
const handlers: EditActionHandler[] = []

function isTextFieldFocused() {
  return (
    document.activeElement?.matches(
      'input, textarea, [contenteditable="true"]'
    ) === true
  )
}

/**
 * Routes Edit ▸ Undo / Redo to the view that claimed it. Mounted once, at the
 * app root: the menu items send the action here rather than running the native
 * text undo, so a view can undo its own edits (see `useUndoRedoHandler`).
 * Anything a view does not handle - typing in a field above all - falls back to
 * the built-in text undo.
 */
export function useUndoRedoMenu() {
  useEffect(() => {
    return window.studio.ui.onRequestUndo((action) => {
      const handled =
        !isTextFieldFocused() && (handlers.at(-1)?.(action) ?? false)

      if (!handled) {
        window.studio.ui.nativeEdit(action)
      }
    })
  }, [])
}

/** Claims Edit ▸ Undo / Redo for as long as the view is mounted. */
export function useUndoRedoHandler(handler: EditActionHandler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const entry: EditActionHandler = (action) => handlerRef.current(action)

    handlers.push(entry)

    return () => {
      handlers.splice(handlers.indexOf(entry), 1)
    }
  }, [])
}
