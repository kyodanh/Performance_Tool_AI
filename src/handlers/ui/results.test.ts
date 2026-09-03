import { mkdtempSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { RunStats } from '@/utils/k6/stats'

// Created before the module under test is imported: it resolves the results
// path once, at import time.
const root = mkdtempSync(join(tmpdir(), 'k6-studio-results-'))

const trashItem = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: () => root,
  },
  shell: {
    trashItem: (filePath: string) => trashItem(filePath) as unknown,
  },
}))

vi.mock('electron-log/main', () => ({
  default: { error: vi.fn() },
}))

const { deleteRunResults, listRunResults, readRunResult, saveRunResult } =
  await import('./results')

const RESULTS = join(root, 'k6-studio', 'Results')

function stats(time?: number): RunStats {
  return {
    buckets: [{ time }],
    requests: 7,
  } as unknown as RunStats
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

  it('keeps one version per run, however often it is saved', async () => {
    const first = await saveRunResult('replay', stats(1787214167))
    const second = await saveRunResult('replay', stats(1787214167))

    expect(first).toBe(second)

    const versions = (await listRunResults()).filter(
      (run) => run.testName === 'replay'
    )

    expect(versions).toHaveLength(1)
  })

  it('lists a named version by its name, and renames rather than forks', async () => {
    await saveRunResult('tuning', stats(1787300000))
    await saveRunResult('tuning', stats(1787300000), 'baseline')
    await saveRunResult('tuning', stats(1787300000), 'after pool tuning')

    const versions = (await listRunResults()).filter(
      (run) => run.testName === 'tuning'
    )

    expect(versions).toHaveLength(1)
    expect(versions[0]?.label).toBe('after pool tuning')
    expect(versions[0]?.ranAt).not.toBeNull()
  })

  it('does not hide a run whose test name starts with a dot', async () => {
    const filePath = await saveRunResult('.tmp-k6studio', stats())

    expect(basename(filePath ?? '')).toMatch(/^tmp-k6studio-/)
  })

  it('lists the test and the run time parsed out of the file name', async () => {
    await mkdir(RESULTS, { recursive: true })
    await writeFile(join(RESULTS, 'checkout-2026-08-28T14-47-25.json'), '{}')

    const run = (await listRunResults()).find(
      (entry) => entry.id === 'checkout-2026-08-28T14-47-25.json'
    )

    expect(run?.testName).toBe('checkout')
    expect(run?.ranAt).toBe('2026-08-28T14:47:25Z')
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

  it('trashes a saved run, and only from inside the results folder', async () => {
    await deleteRunResults(['gone-2026-01-01T00-00-00.json', '../outside.json'])

    expect(trashItem).toHaveBeenCalledWith(
      join(RESULTS, 'gone-2026-01-01T00-00-00.json')
    )
    expect(trashItem).toHaveBeenCalledWith(join(RESULTS, 'outside.json'))
  })

  it('cannot be pointed outside the results folder', async () => {
    await writeFile(join(root, 'k6-studio', 'outside.json'), '{"testName":"x"}')

    expect(await readRunResult('../outside.json')).toBeNull()
  })
})
