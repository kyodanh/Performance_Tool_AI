import { describe, expect, it, vi } from 'vitest'

import { TestRun } from './testRun'

describe('TestRun', () => {
  it('ends a run carried only by generators when stopped', async () => {
    // No local process means no `close` event to end the run, so `stop` has to
    // report it itself — otherwise the UI stays stuck on "Running".
    const run = new TestRun(null)
    const onStop = vi.fn()
    const onAbort = vi.fn()

    run.on('stop', onStop)
    run.on('abort', onAbort)

    await run.stop()

    expect(onAbort).toHaveBeenCalledOnce()
    expect(onStop).toHaveBeenCalledOnce()
    expect(run.isRunning()).toBe(false)
  })
})
