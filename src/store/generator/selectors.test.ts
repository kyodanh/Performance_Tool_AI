import { beforeEach, describe, expect, it } from 'vitest'

import { createGeneratorData } from '@/test/factories/generator'

import { selectGeneratorData } from './selectors'
import { useGeneratorStore } from './useGeneratorStore'

beforeEach(() => {
  useGeneratorStore.getState().resetGeneratorFile()
})

describe('wizardUsed round-trip', () => {
  it('starts out false', () => {
    expect(selectGeneratorData(useGeneratorStore.getState()).wizardUsed).toBe(
      false
    )
  })

  it('survives loading and saving a generator file', () => {
    useGeneratorStore
      .getState()
      .setGeneratorFile(createGeneratorData({ wizardUsed: true }))

    expect(selectGeneratorData(useGeneratorStore.getState()).wizardUsed).toBe(
      true
    )
  })

  it('is saved after the wizard marks the generator', () => {
    useGeneratorStore.getState().setWizardUsed(true)

    expect(selectGeneratorData(useGeneratorStore.getState()).wizardUsed).toBe(
      true
    )
  })
})

describe('groupOrder round-trip', () => {
  it('starts out empty', () => {
    expect(
      selectGeneratorData(useGeneratorStore.getState()).groupOrder
    ).toEqual([])
  })

  it('saves the order the groups were dragged into', () => {
    useGeneratorStore.getState().setGroupOrder(['Login', 'Dashboard'])

    expect(
      selectGeneratorData(useGeneratorStore.getState()).groupOrder
    ).toEqual(['Login', 'Dashboard'])
  })

  it('survives loading and saving a generator file', () => {
    useGeneratorStore
      .getState()
      .setGeneratorFile(createGeneratorData({ groupOrder: ['Login'] }))

    expect(
      selectGeneratorData(useGeneratorStore.getState()).groupOrder
    ).toEqual(['Login'])
  })
})
