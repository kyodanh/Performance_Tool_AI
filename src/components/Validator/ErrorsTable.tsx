import { css } from '@emotion/react'
import { Box, Button, Dialog, Flex, Text } from '@radix-ui/themes'
import { useState } from 'react'

import { Table } from '@/components/Table'
import { RunErrorGroup } from '@/utils/k6/stats'

import { describeCode, describeError, formatCount } from './format'

function errorKey(error: RunErrorGroup) {
  return `${error.code}|${error.message}|${error.url}|${error.group}`
}

/** `file=index` pairs the run tagged, or a dash when no data file was used. */
function describeDataRows(error: RunErrorGroup) {
  return error.dataRows.join(', ') || '—'
}

interface ErrorsTableProps {
  errors: RunErrorGroup[]
}

/**
 * Errors grouped by code, message, request and transaction. A row opens the
 * full text, which the truncated cell can never show on its own.
 */
export function ErrorsTable({ errors }: ErrorsTableProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedError = errors.find((error) => errorKey(error) === selected)

  // The column is dead weight for a run with no data file, which is most of
  // them — only the scripts that parameterize get the tag.
  const hasDataRows = errors.some((error) => error.dataRows.length > 0)

  return (
    <>
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell width="80px">Code</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="80px" align="right">
              Count
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Message</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Transaction</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Request</Table.ColumnHeaderCell>
            {hasDataRows && (
              <Table.ColumnHeaderCell width="140px">
                Data rows
              </Table.ColumnHeaderCell>
            )}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {errors.map((error) => (
            <Table.Row
              key={errorKey(error)}
              onClick={() => setSelected(errorKey(error))}
              css={rowStyles}
            >
              <Table.Cell>{describeCode(error)}</Table.Cell>
              <Table.Cell align="right">{formatCount(error.count)}</Table.Cell>
              <Table.Cell css={truncate}>{describeError(error)}</Table.Cell>
              <Table.Cell>{error.group || '—'}</Table.Cell>
              <Table.Cell css={truncate}>{error.url}</Table.Cell>
              {hasDataRows && (
                <Table.Cell css={truncate}>
                  {describeDataRows(error)}
                </Table.Cell>
              )}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      <Dialog.Root
        open={selectedError !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
      >
        <Dialog.Content maxWidth="800px" width="90vw">
          <Dialog.Title size="4">Error detail</Dialog.Title>
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">
              Detailed message text
            </Text>
            <Box css={detailBox}>
              {selectedError &&
                [
                  `[HTTP ${describeCode(selectedError)} · k6 code ${selectedError.code}]`,
                  describeError(selectedError),
                  selectedError.group &&
                    `\nTransaction: ${selectedError.group}`,
                  selectedError.url && `\n${selectedError.url}`,
                  `\n${formatCount(selectedError.count)} occurrence(s)`,
                  selectedError.dataRows.length > 0 &&
                    `\nData rows (first 5 distinct): ${describeDataRows(selectedError)}`,
                ]
                  .filter(Boolean)
                  .join(' ')}
            </Box>
          </Flex>
          <Flex justify="end" mt="3">
            <Dialog.Close>
              <Button variant="soft">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}

const rowStyles = css`
  cursor: pointer;

  &:hover {
    background-color: var(--gray-3);
  }
`

const truncate = css`
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const detailBox = css`
  border: 1px solid var(--gray-5);
  border-radius: var(--radius-2);
  padding: var(--space-2);
  min-height: 64px;
  font-family: var(--code-font-family);
  font-size: var(--font-size-1);
  user-select: text;
  white-space: pre-wrap;
  word-break: break-all;
`
