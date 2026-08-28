import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ExportPlan } from '@/codegen/export'
import { useGeneratorStore } from '@/store/generator'
import { createFixedTiming } from '@/utils/thinkTime'

import { ExportPlanTree } from './ExportPlanTree'

const plan: ExportPlan = {
  load: { executor: 'shared-iterations', vus: 5, iterations: 10 },
  thinkTime: { sleepType: 'groups', timing: createFixedTiming(1) },
  httpTimeout: 120,
  variables: [{ name: 'token', value: 'abc' }],
  dataFiles: ['users.csv'],
  groups: [
    {
      name: 'default',
      requests: [
        {
          id: 'r1',
          key: 'POST https://example.com/login',
          name: 'POST /login',
          method: 'POST',
          url: 'https://example.com/login',
          headers: [['content-type', 'application/json']],
          cookies: [],
          content: null,
          extractions: [
            {
              variable: 'csrf',
              selector: { type: 'regex', from: 'body', regex: 'x' },
              filterPath: '',
            },
          ],
          assertions: [
            {
              target: 'status',
              operator: 'equals',
              value: 200,
              negated: false,
            },
          ],
          thinkTime: null,
          rendezvous: false,
        },
      ],
    },
  ],
  warnings: ['Custom code rule was not exported.'],
}

function renderTree(editable: boolean) {
  return render(
    <Theme>
      <ExportPlanTree plan={plan} format="jmeter" editable={editable} />
    </Theme>
  )
}

describe('ExportPlanTree', () => {
  beforeEach(() => {
    useGeneratorStore.setState({
      executor: 'shared-iterations',
      vus: 5,
      iterations: 10,
      httpTimeout: 120,
      thinkTimeOverrides: {},
      rendezvous: {},
    })
  })

  it('renders the plan with JMeter element names and surfaces warnings', () => {
    renderTree(false)

    expect(screen.getByText('Test Plan')).toBeDefined()
    expect(screen.getByText('Thread Group')).toBeDefined()
    expect(screen.getByText('Transaction Controller')).toBeDefined()
    expect(screen.getByText('HTTP Request')).toBeDefined()
    expect(screen.getByText('Response Assertion')).toBeDefined()
    expect(screen.getByText('Custom code rule was not exported.')).toBeDefined()
  })

  it('is read-only unless editing is allowed', () => {
    renderTree(false)

    expect(screen.queryByLabelText('VUs')).toBeNull()
    expect(screen.getByText('5 VUs · 10 iterations')).toBeDefined()
  })

  it('writes edits back to the generator, so every target regenerates', async () => {
    const user = userEvent.setup()
    renderTree(true)

    await user.clear(screen.getByLabelText('VUs'))
    await user.type(screen.getByLabelText('VUs'), '25')
    expect(useGeneratorStore.getState().vus).toBe(25)

    await user.clear(screen.getByLabelText('Timeout'))
    await user.type(screen.getByLabelText('Timeout'), '30')
    expect(useGeneratorStore.getState().httpTimeout).toBe(30)

    await user.click(screen.getByLabelText(/Rendezvous/i))
    expect(
      useGeneratorStore.getState().rendezvous['POST https://example.com/login']
    ).toBe(true)
  })
})
