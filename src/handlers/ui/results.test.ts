import { mkdtempSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { RunStats } from '@/utils/k6/stats'

// Created before the module under test is imported: it resolves the results
// path once, at import time.
const root = mkdtempSync(join(tmpdir(), 'k6-studio-results-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => root,
  },
}))

vi.mock('electron-log/main', () => ({
  default: { error: vi.fn() },
}))

const { listRunResults, readRunResult, saveRunResult } =
  await import('./results')

const RESULTS = join(root, 'k6-studio', 'Results')

function stats(): RunStats {
  return { buckets: [{}], requests: 7 } as unknown as RunStats
}

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('run results', () => {
  it('saves a run under a file name safe on every platform', async () => {
    const filePath = await saveRunResult('login/flow: v2', stats())

    expect(filePath).not.toBeNull()
    expect(filePath).toContain('login_flow_ v2-')
  })

  it('reads a saved run back', async () => {
    const filePath = await saveRunResult('checkout', stats())
    const result = await readRunResult(basename(filePath ?? ''))

    expect(result?.testName).toBe('checkout')
    expect(result?.stats.requests).toBe(7)
    expect(Date.parse(result?.ranAt ?? '')).not.toBeNaN()
  })

  it('lists runs newest first, ignoring anything that is not a result', async () => {
    await mkdir(RESULTS, { recursive: true })
    await writeFile(join(RESULTS, 'a-2026-01-01T00-00-00.json'), '{}')
    await writeFile(join(RESULTS, 'b-2026-06-01T00-00-00.json'), '{}')
    await writeFile(join(RESULTS, 'notes.txt'), 'ignored')

    const ids = (await listRunResults()).map((run) => run.id)

    expect(ids).not.toContain('notes.txt')
    expect(ids.indexOf('b-2026-06-01T00-00-00.json')).toBeLessThan(
      ids.indexOf('a-2026-01-01T00-00-00.json')
    )
  })

  it('cannot be pointed outside the results folder', async () => {
    await writeFile(join(root, 'k6-studio', 'outside.json'), '{"testName":"x"}')

    expect(await readRunResult('../outside.json')).toBeNull()
  })
})
