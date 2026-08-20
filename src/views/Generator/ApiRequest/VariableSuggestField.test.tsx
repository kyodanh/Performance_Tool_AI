import { Theme } from '@radix-ui/themes'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { afterEach, expect, it } from 'vitest'

import { VariableSuggestField } from './VariableSuggestField'

afterEach(cleanup)

function TestField() {
  const [value, setValue] = useState('')

  return (
    <Theme>
      <VariableSuggestField
        aria-label="Header value"
        names={['token', 'user_id']}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        onInsert={setValue}
      />
    </Theme>
  )
}

function type(value: string) {
  const input = screen.getByLabelText<HTMLInputElement>('Header value')

  fireEvent.change(input, { target: { value } })
  // `change` does not carry a caret, so place it at the end like typing does.
  input.setSelectionRange(value.length, value.length)
  fireEvent.input(input)

  return input
}

it('suggests variables while a placeholder is open', () => {
  render(<TestField />)

  type('Bearer {')
  expect(screen.getByRole('option', { name: '{token}' })).toBeTruthy()
  expect(screen.getByRole('option', { name: '{user_id}' })).toBeTruthy()

  type('Bearer {to')
  expect(screen.queryByRole('option', { name: '{user_id}' })).toBeNull()
})

it('hides the list once the placeholder is closed', () => {
  render(<TestField />)

  type('Bearer {token}')
  expect(screen.queryByRole('option')).toBeNull()
})

it('completes the placeholder in place', () => {
  render(<TestField />)

  const input = type('Bearer {to')

  fireEvent.mouseDown(screen.getByRole('option', { name: '{token}' }))
  expect(input.value).toBe('Bearer {token}')
})

// The dialog registers the field instead of controlling it, so `setValue` is
// what has to reach the DOM input.
function RegisteredField() {
  const { register, setValue } = useForm({ defaultValues: { value: '' } })

  return (
    <Theme>
      <VariableSuggestField
        aria-label="Header value"
        names={['token']}
        onInsert={(value) => setValue('value', value)}
        {...register('value')}
      />
    </Theme>
  )
}

it('completes a registered (uncontrolled) field', () => {
  render(<RegisteredField />)

  const input = type('Bearer {to')

  fireEvent.mouseDown(screen.getByRole('option', { name: '{token}' }))
  expect(input.value).toBe('Bearer {token}')
})
