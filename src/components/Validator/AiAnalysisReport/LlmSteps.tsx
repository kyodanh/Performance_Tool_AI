import { css } from '@emotion/react'
import { Box, Grid, Text } from '@radix-ui/themes'

import { SimpleMarkdown } from '@/components/Assistant/SimpleMarkdown'

interface Step {
  title: string
  body: string
}

/**
 * The prompt asks for `## 1. <title>` sections; each becomes a numbered step.
 * Text before the first heading is kept as an untitled lead-in.
 */
export function splitSteps(text: string): { lead: string; steps: Step[] } {
  const [lead = '', ...sections] = text.split(/^##\s+/m)

  return {
    lead: lead.trim(),
    steps: sections.map((section) => {
      const [heading = '', ...body] = section.split('\n')

      return {
        title: heading.replace(/^\d+[.)]\s*/, '').trim(),
        body: body.join('\n').trim(),
      }
    }),
  }
}

/** The LLM's answer as numbered steps; unstructured answers render as-is. */
export function LlmSteps({ text }: { text: string }) {
  const { lead, steps } = splitSteps(text)

  if (steps.length === 0) {
    return <SimpleMarkdown text={text} />
  }

  return (
    <Grid gap="5">
      {lead && <SimpleMarkdown text={lead} />}
      {steps.map((step, i) => (
        <Grid key={i} columns="28px minmax(0, 1fr)" gap="3">
          <Box
            css={css`
              width: 28px;
              height: 28px;
              border-radius: var(--radius-3);
              background: var(--gray-12);
              color: var(--gray-1);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 13px;
              font-weight: 700;
            `}
          >
            {i + 1}
          </Box>
          <Box>
            <Text as="div" size="3" weight="bold" mb="2">
              {step.title}
            </Text>
            <SimpleMarkdown text={step.body} />
          </Box>
        </Grid>
      ))}
    </Grid>
  )
}
