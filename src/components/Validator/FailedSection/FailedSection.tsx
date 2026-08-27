import { Box, Callout, Flex, ScrollArea, Text } from '@radix-ui/themes'
import { InfoIcon } from 'lucide-react'
import { ReactNode } from 'react'

import { Table } from '@/components/Table'
import { ChecksTable } from '@/components/Validator/ChecksTable'
import { Check } from '@/schemas/k6'
import { RunStats } from '@/utils/k6/stats'

interface FailedSectionProps {
  checks: Check[]
  stats: RunStats | null
}

export function hasFailures(checks: Check[], stats: RunStats | null): boolean {
  return (
    checks.some((check) => check.fails > 0) ||
    (stats?.errors.length ?? 0) > 0 ||
    // A 4xx/5xx response raises no transport error, so `errors` stays empty.
    (stats?.failedRequests ?? 0) > 0
  )
}

export function FailedSection({ checks, stats }: FailedSectionProps) {
  // The metric stream carries the request and group each check ran in; the
  // stdout summary does not, so prefer it when both are available.
  const failedCheckStats = (stats?.checks ?? []).filter(
    (check) => check.fails > 0
  )
  const errors = stats?.errors ?? []
  const failedRequests = (stats?.requestStats ?? []).filter(
    (request) => request.failed > 0
  )

  if (!hasFailures(checks, stats)) {
    return <NoFailuresMessage />
  }

  return (
    <ScrollArea scrollbars="vertical">
      <Flex direction="column" gap="4" p="2" pb="4">
        {failedCheckStats.length > 0 && (
          <Section title="Failed checks">
            <ChecksTable checks={failedCheckStats} />
          </Section>
        )}

        {errors.length > 0 && (
          <Section title="Errors">
            <Table.Root size="1" variant="ghost">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Message</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>URL</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell align="right">
                    Count
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {errors.map((error, index) => (
                  <Table.Row key={index}>
                    <Table.Cell>{error.code || '—'}</Table.Cell>
                    <Table.Cell>{error.message || '—'}</Table.Cell>
                    <Table.Cell>{error.url}</Table.Cell>
                    <Table.Cell align="right">{error.count}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Section>
        )}

        {failedRequests.length > 0 && (
          <Section title="Slow / failed requests">
            <Table.Root size="1" variant="ghost">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Request</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell align="right">
                    Failed
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell align="right">
                    Avg
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell align="right">
                    Max
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {failedRequests.map((request, index) => (
                  <Table.Row key={index}>
                    <Table.Cell>
                      {request.method} {request.name}
                    </Table.Cell>
                    <Table.Cell align="right">
                      {request.failed}/{request.count}
                    </Table.Cell>
                    <Table.Cell align="right">
                      {request.avg.toFixed(0)}ms
                    </Table.Cell>
                    <Table.Cell align="right">
                      {request.max.toFixed(0)}ms
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Section>
        )}
      </Flex>
    </ScrollArea>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Flex direction="column" gap="1">
      <Text size="1" weight="medium" color="gray">
        {title.toUpperCase()}
      </Text>
      {children}
    </Flex>
  )
}

function NoFailuresMessage() {
  return (
    <Box p="2">
      <Callout.Root>
        <Callout.Icon>
          <InfoIcon />
        </Callout.Icon>
        <Callout.Text>No failures in this run.</Callout.Text>
      </Callout.Root>
    </Box>
  )
}
