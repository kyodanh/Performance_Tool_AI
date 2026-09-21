import { css } from '@emotion/react'
import {
  Badge,
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  Grid,
  Spinner,
  Text,
} from '@radix-ui/themes'
import { AlertTriangleIcon, SparklesIcon } from 'lucide-react'
import { ReactNode } from 'react'

import {
  AnalyzeFailureRequest,
  AnalyzeFailureResult,
  JevReport,
  TriageRoute,
} from '@/handlers/ai/errorAnalysis/types'
import { useToast } from '@/store/ui/useToast'

import { JevCauseCard } from './JevCauseCard'
import { LlmSteps } from './LlmSteps'
import { SectionHeading } from './SectionHeading'
import { confidenceColor, eyebrow, mono } from './styles'
import { TimingBreakdown } from './TimingBreakdown'

const ROUTE: Record<
  TriageRoute,
  { badge: string; color: 'green' | 'amber' | 'orange'; note: string }
> = {
  auto: {
    badge: 'Jev chắc chắn',
    color: 'green',
    note: 'Jev chắc chắn — kết luận trên đáng tin',
  },
  llm: {
    badge: 'Cần đối chiếu',
    color: 'amber',
    note: 'Jev tương đối chắc — nên đối chiếu lại với dữ liệu',
  },
  human: {
    badge: 'Cần người kiểm tra',
    color: 'orange',
    note: 'Jev không chắc chắn — cần người kiểm tra',
  },
}

interface AiAnalysisReportProps {
  title: string
  request: AnalyzeFailureRequest
  result: AnalyzeFailureResult | undefined
  pending: boolean
  /** Shown above the results, e.g. the sign-in gate. */
  children?: ReactNode
}

/** Markdown of what the dialog shows, for pasting into a ticket or a chat. */
function toMarkdown(title: string, jev?: JevReport, text?: string) {
  const rows = (jev?.rows ?? []).map(
    (row) =>
      `- **${row.endpoint}**${row.group ? ` · ${row.group}` : ''} — ${row.meaning} (k6 ${row.code}), ${row.count} lỗi → ${row.causes.map((c) => `${c.label} ${Math.round(c.share * 100)}%`).join(' · ') || 'không có kết quả'} (độ tin cậy ${row.confidence?.toFixed(2) ?? '—'})`
  )

  return [
    `# ${title}`,
    ...(jev
      ? [
          '## Nguyên nhân lỗi (TypeSafe Jev)',
          ...rows,
          `> ${ROUTE[jev.route].note}`,
        ]
      : []),
    ...(text ? ['## Phân tích LLM', text] : []),
  ].join('\n\n')
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box px="5" py="3" css={{ background: 'var(--color-panel-solid)' }}>
      <Text as="div" css={eyebrow}>
        {label}
      </Text>
      <Text as="div" size="6" weight="bold" mt="1" css={mono}>
        {children}
      </Text>
    </Box>
  )
}

/**
 * The analysis dialog's content: run figures up top, Jev's verdict per error,
 * then the LLM's answer as numbered steps. The figures come from the request,
 * so they show while the analysis is still running.
 */
export function AiAnalysisReport({
  title,
  request,
  result,
  pending,
  children,
}: AiAnalysisReportProps) {
  const showToast = useToast()

  const done = !pending && result && !('error' in result) ? result : undefined
  const jev = done?.jev
  const failed = request.errors.reduce((sum, error) => sum + error.count, 0)
  const endpoints = new Set(request.errors.map((error) => error.url)).size
  const groups = [
    ...new Set(request.errors.map((e) => e.group).filter(Boolean)),
  ]
  const codes = [...new Set(request.errors.map((e) => e.code).filter(Boolean))]

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(title, jev, done?.text))
      showToast({ title: 'Analysis copied as Markdown', status: 'success' })
    } catch {
      showToast({ title: 'Failed to copy the analysis', status: 'error' })
    }
  }

  return (
    <>
      <Flex
        align="start"
        gap="4"
        px="5"
        py="4"
        css={css`
          border-bottom: 1px solid var(--gray-a4);
        `}
      >
        <Flex
          align="center"
          justify="center"
          flexShrink="0"
          css={css`
            width: 34px;
            height: 34px;
            border-radius: var(--radius-3);
            background: var(--accent-a3);
            border: 1px solid var(--accent-a5);
            color: var(--accent-11);
          `}
        >
          <SparklesIcon size={16} />
        </Flex>
        <Box flexGrow="1" minWidth="0">
          <Dialog.Title size="5" mb="0">
            {title}
          </Dialog.Title>
          <Text as="div" size="2" color="gray" mt="1">
            {[
              groups.join(', '),
              codes.length > 0 && `k6 ${codes.join('/')}`,
              `${failed} request lỗi`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Box>
        <Flex align="center" gap="2">
          {jev && (
            <Badge size="2" radius="full" color={ROUTE[jev.route].color}>
              {ROUTE[jev.route].badge}
            </Badge>
          )}
          <Button
            variant="outline"
            color="gray"
            disabled={!done}
            onClick={() => void handleCopy()}
          >
            Copy
          </Button>
        </Flex>
      </Flex>

      <Grid
        columns={{ initial: '2', sm: '4' }}
        gap="1px"
        css={css`
          background: var(--gray-a4);
          border-bottom: 1px solid var(--gray-a4);
        `}
      >
        <Stat label="Request lỗi">{failed}</Stat>
        <Stat label="Endpoint ảnh hưởng">{endpoints}</Stat>
        <Stat label="Max response">
          <Text color="red">
            {request.summary
              ? (request.summary.maxDuration / 1000).toFixed(1)
              : '—'}
          </Text>
          <Text size="2" color="gray" weight="medium">
            {' '}
            s
          </Text>
        </Stat>
        <Stat label="Độ tin cậy thấp nhất">
          <Text color={jev ? confidenceColor(jev.confidence) : 'gray'}>
            {jev ? jev.confidence.toFixed(2) : '—'}
          </Text>
        </Stat>
      </Grid>

      <Box flexGrow="1" overflowY="auto" px="5" pt="5" pb="4">
        {children}

        {pending && (
          <Flex align="center" gap="2" py="4">
            <Spinner />
            Analyzing this run…
          </Flex>
        )}

        {!pending && result && 'error' in result && (
          <Callout.Root size="1" color="red">
            <Callout.Icon>
              <AlertTriangleIcon size={16} />
            </Callout.Icon>
            <Callout.Text>{result.error}</Callout.Text>
          </Callout.Root>
        )}

        {jev && (
          <Box mb="6">
            <SectionHeading title="Nguyên nhân lỗi" source="TypeSafe Jev" />
            <Grid gap="3">
              {jev.rows.map((row, i) => (
                <JevCauseCard key={i} row={row} />
              ))}
            </Grid>
            <Callout.Root
              mt="4"
              size="1"
              variant="surface"
              color={ROUTE[jev.route].color}
            >
              <Callout.Icon>
                <AlertTriangleIcon size={16} />
              </Callout.Icon>
              <Callout.Text>
                <strong>{ROUTE[jev.route].note}</strong> (độ tin cậy thấp nhất{' '}
                {jev.confidence.toFixed(2)}).
              </Callout.Text>
            </Callout.Root>
          </Box>
        )}

        {done && (done.text || done.llmError) && (
          <Box>
            <SectionHeading title="Phân tích LLM" />
            {done.llmError ? (
              <Callout.Root size="1" color="red">
                <Callout.Icon>
                  <AlertTriangleIcon size={16} />
                </Callout.Icon>
                <Callout.Text>LLM lỗi: {done.llmError}</Callout.Text>
              </Callout.Root>
            ) : (
              <LlmSteps text={done.text} />
            )}
          </Box>
        )}

        {done && request.summary && (
          <TimingBreakdown timings={request.summary.timings} />
        )}
      </Box>

      <Flex
        align="center"
        gap="3"
        px="5"
        py="3"
        css={css`
          border-top: 1px solid var(--gray-a4);
        `}
      >
        <Text size="1" color="gray">
          Phân tích tự động — hãy đối chiếu với log hệ thống trước khi kết luận.
        </Text>
        <Box flexGrow="1" />
        <Dialog.Close>
          <Button>Close</Button>
        </Dialog.Close>
      </Flex>
    </>
  )
}
