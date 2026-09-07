import log from 'electron-log/renderer'
import { createRoot } from 'react-dom/client'

import { App } from './App'

// Must register before electron-log to suppress benign ResizeObserver
// warnings triggered by Radix UI during layout shifts.
window.addEventListener('error', (event) => {
  if (event.message?.includes('ResizeObserver loop')) {
    event.stopImmediatePropagation()
  }
})

// Monaco rejects the promise behind its debounced tasks with a `Canceled`
// error whenever a widget is disposed mid-delay — closing an editor disposes
// WordHighlighter that way. Nothing upstream awaits that promise, so every
// editor teardown would be logged as an unhandled rejection.
window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason

  if (
    reason instanceof Error &&
    reason.name === 'Canceled' &&
    reason.message === 'Canceled'
  ) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
})

log.errorHandler.startCatching()

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
