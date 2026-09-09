import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/home/user/Documents',
  },
}))

const {
  getGeneratorsPath,
  getProjectPath,
  runInProject,
  setActiveWorkspaceRoot,
} = await import('./workspace')

describe('project context', () => {
  it('falls back to the active root outside any context', () => {
    setActiveWorkspaceRoot('/projects/alpha')

    expect(getProjectPath()).toBe('/projects/alpha')
  })

  it('overrides the active root inside a context, across awaits', async () => {
    setActiveWorkspaceRoot('/projects/alpha')

    const inside = await runInProject('/projects/beta', async () => {
      await Promise.resolve()

      return getGeneratorsPath()
    })

    expect(inside).toBe('/projects/beta/Generators')
    expect(getProjectPath()).toBe('/projects/alpha')
  })

  it('keeps concurrent contexts apart', async () => {
    setActiveWorkspaceRoot('')

    const [alpha, beta] = await Promise.all([
      runInProject('/projects/alpha', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))

        return getProjectPath()
      }),
      runInProject('/projects/beta', () => Promise.resolve(getProjectPath())),
    ])

    expect([alpha, beta]).toEqual(['/projects/alpha', '/projects/beta'])
  })
})
