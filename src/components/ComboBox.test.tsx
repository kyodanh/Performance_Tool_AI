import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { ComboBox } from './ComboBox'

const OPTIONS = [
  { label: 'existing_group', value: 'existing_group' },
  { label: 'other_group', value: 'other_group' },
]

function Harness({ initial = 'existing_group' }: { initial?: string }) {
  const [value, setValue] = useState(initial)

  return (
    <>
      <ComboBox
        id="combo"
        value={value}
        options={OPTIONS}
        onChange={setValue}
        portalMenu={false}
      />
      <button>elsewhere</button>
      <output data-testid="value">{value}</output>
    </>
  )
}

describe('ComboBox', () => {
  it('keeps a name typed but never confirmed when focus leaves', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByRole('combobox'), 'brand_new_group')
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(screen.getByTestId('value').textContent).toBe('brand_new_group')
  })

  it('does not overwrite a picked option with the text used to filter it', async () => {
    const user = userEvent.setup()
    render(<Harness initial="" />)

    await user.type(screen.getByRole('combobox'), 'other')
    await user.click(screen.getByText('other_group'))
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(screen.getByTestId('value').textContent).toBe('other_group')
  })
})
