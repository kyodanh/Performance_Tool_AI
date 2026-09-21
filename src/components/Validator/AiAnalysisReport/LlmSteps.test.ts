import { describe, expect, it } from 'vitest'

import { splitSteps } from './LlmSteps'

describe('splitSteps', () => {
  it('turns `## N. title` sections into steps, keeping a lead-in', () => {
    expect(
      splitSteps('Tóm tắt.\n\n## 1. Nguyên nhân\nA\n\n## 2) Đề xuất\n- B')
    ).toEqual({
      lead: 'Tóm tắt.',
      steps: [
        { title: 'Nguyên nhân', body: 'A' },
        { title: 'Đề xuất', body: '- B' },
      ],
    })
  })

  it('leaves an answer without headings as a lead-in only', () => {
    expect(splitSteps('Chỉ một đoạn.')).toEqual({
      lead: 'Chỉ một đoạn.',
      steps: [],
    })
  })
})
