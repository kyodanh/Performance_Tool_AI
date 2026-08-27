import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GeneratorStore } from '@/store/generator'
import { createGeneratorState } from '@/test/factories/generator'

import { resolveRequestVariables } from './useCorrelationVariables'

vi.mock('electron-log/renderer', () => ({
  default: { error: vi.fn() },
}))

function stubDataFile(rows: Record<string, string>[]) {
  vi.stubGlobal('studio', {
    fs: {
      openFile: vi.fn().mockResolvedValue({
        type: 'data-file',
        isExternal: false,
        data: {
          type: 'csv',
          props: ['username'],
          data: rows,
          total: rows.length,
        },
      }),
    },
  })
}

function state(variables: GeneratorStore['variables']): GeneratorStore {
  return {
    ...createGeneratorState(),
    variables,
  } as GeneratorStore
}

describe('resolveRequestVariables', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves a file-bound variable from the first row', async () => {
    stubDataFile([{ username: 'first@b.com' }, { username: 'second@b.com' }])

    const values = await resolveRequestVariables(
      state([
        {
          name: 'user',
          value: '',
          file: { fileName: '/d/users.csv', propertyName: 'username' },
        },
        { name: 'realm', value: 'employee' },
      ])
    )

    expect(values).toMatchObject({ user: 'first@b.com', realm: 'employee' })
  })

  it('leaves the variable unresolved when the file has no rows', async () => {
    stubDataFile([])

    const values = await resolveRequestVariables(
      state([
        {
          name: 'user',
          value: '',
          file: { fileName: '/d/users.csv', propertyName: 'username' },
        },
      ])
    )

    expect(values.user).toBeUndefined()
  })
})
