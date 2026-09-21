import { css } from '@emotion/react'
import { Badge, Box, Flex, Grid, Text } from '@radix-ui/themes'

import { TriageRow } from '@/handlers/ai/errorAnalysis/types'

import { CAUSE_COLOR, confidenceColor, eyebrow, mono } from './styles'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** `1500` → `HTTP 500`, anything else keeps its k6 code. */
function codeBadge(code: string) {
  const n = Number(code)

  return n >= 1400 && n < 1600 ? `HTTP ${n - 1000}` : `k6 ${code || '—'}`
}

function Figure({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: 'red' | 'orange' | 'amber' | 'green'
}) {
  return (
    <Box
      css={css`
        padding: 9px 11px;
        border-radius: var(--radius-3);
        background: ${color ? `var(--${color}-a3)` : 'var(--gray-a2)'};
        border: 1px solid ${color ? `var(--${color}-a5)` : 'var(--gray-a4)'};
      `}
    >
      <Text as="div" css={eyebrow}>
        {label}
      </Text>
      <Text
        as="div"
        size="3"
        weight="medium"
        color={color}
        highContrast={!color}
        css={mono}
      >
        {value}
      </Text>
    </Box>
  )
}

/** One error group: what failed, Jev's split of causes, and how sure it is. */
export function JevCauseCard({ row }: { row: TriageRow }) {
  const serverError = row.code.startsWith('15')

  return (
    <Box
      css={css`
        border: 1px solid var(--gray-a5);
        border-radius: var(--radius-4);
        background: var(--color-panel-solid);
        overflow: hidden;
      `}
    >
      <Flex
        wrap="wrap"
        align="center"
        gap="2"
        px="4"
        py="3"
        css={css`
          border-bottom: 1px solid var(--gray-a3);
        `}
      >
        <Text size="3" weight="bold" css={mono}>
          {row.endpoint}
        </Text>
        <Badge color={serverError ? 'red' : 'orange'} css={mono}>
          {codeBadge(row.code)}
        </Badge>
        <Text size="1" color="gray">
          {row.meaning.replace(/^HTTP \d+ /, '')} · k6 {row.code}
          {row.group && ` · ${row.group}`}
        </Text>
        <Box flexGrow="1" />
        <Text size="1" color="gray">
          <Text weight="bold" highContrast css={mono}>
            {row.request
              ? `${row.request.failed}/${row.request.count}`
              : row.count}
          </Text>{' '}
          lỗi
        </Text>
      </Flex>

      <Grid columns={{ initial: '1', sm: '11fr 10fr' }} gap="5" px="4" py="4">
        <Box>
          <Text as="div" mb="2" css={eyebrow}>
            Phân bổ nguyên nhân
          </Text>
          {row.causes.length > 0 ? (
            <>
              <Flex
                css={css`
                  height: 9px;
                  border-radius: 5px;
                  overflow: hidden;
                  background: var(--gray-a3);
                `}
              >
                {row.causes.map(({ cause, share }) => (
                  <Box
                    key={cause}
                    css={css`
                      width: ${share * 100}%;
                      background: ${CAUSE_COLOR[cause] ?? 'var(--gray-8)'};
                    `}
                  />
                ))}
              </Flex>
              <Flex wrap="wrap" gap="4" mt="2">
                {row.causes.map(({ cause, label, share }) => (
                  <Flex key={cause} align="center" gap="1">
                    <Box
                      css={css`
                        width: 8px;
                        height: 8px;
                        border-radius: 2px;
                        background: ${CAUSE_COLOR[cause] ?? 'var(--gray-8)'};
                      `}
                    />
                    <Text size="2">
                      {label} <strong>{Math.round(share * 100)}%</strong>
                    </Text>
                  </Flex>
                ))}
              </Flex>
            </>
          ) : (
            <Text size="2" color="gray">
              Jev không trả kết quả cho lỗi này.
            </Text>
          )}
        </Box>

        <Grid columns="3" gap="2" align="start">
          <Figure
            label="avg"
            value={row.request ? seconds(row.request.avg) : '—'}
          />
          <Figure
            label="max"
            value={row.request ? seconds(row.request.max) : '—'}
            color={row.request ? 'red' : undefined}
          />
          <Figure
            label="tin cậy"
            value={row.confidence?.toFixed(2) ?? '—'}
            color={confidenceColor(row.confidence)}
          />
        </Grid>
      </Grid>
    </Box>
  )
}
