import { Box, Flex } from '@radix-ui/themes'

import { HighlightedText } from '@/components/HighlightedText'
import { Table } from '@/components/Table'
import { TextWithTooltip } from '@/components/TextWithTooltip'
import {
  HostCell,
  MethodCell,
  RequestTypeCell,
  RowProps,
  StatusCell,
  TableRow,
} from '@/components/WebLogView'
import { SearchResults } from '@/components/WebLogView/SearchResults'
import { useGeneratorStore } from '@/store/generator'
import { RuleInstance } from '@/types/rules'

import { RendezvousBadge } from './RendezvousBadge'
import { RowActions } from './RowActions'
import { RuleBadges } from './RuleBadges'
import { ThinkTimeBadge } from './ThinkTimeBadge'

export function RequestRow({
  data,
  onSelectRequest,
  isSelected,
  filter,
  selectedRuleInstance,
}: RowProps & { selectedRuleInstance?: RuleInstance }) {
  // `data` has rules applied, so edit the stored request instead of the row.
  const manualRequest = useGeneratorStore((state) =>
    state.manualRequests.find((request) => request.id === data.id)
  )
  const previewOriginalRequests = useGeneratorStore(
    (state) => state.previewOriginalRequests
  )

  return (
    <>
      <TableRow
        data={data}
        onSelectRequest={onSelectRequest}
        isSelected={isSelected}
      >
        <MethodCell data={data} isSelected={isSelected} />
        <StatusCell data={data} />
        <RequestTypeCell data={data} />
        <HostCell data={data} />

        <Table.Cell css={{ padding: 0 }}>
          <Flex align="center" height="100%" gap="1">
            <TextWithTooltip
              size="1"
              css={{
                fontFamily: 'var(--code-font-family)',
                flex: '0 1 auto',
                minWidth: 0,
              }}
            >
              <HighlightedText
                text={data.request.path}
                matches={data.matches}
                highlightAllMatches
              />
            </TextWithTooltip>
            <RuleBadges
              selectedRuleInstance={selectedRuleInstance}
              data={data}
            />
            <ThinkTimeBadge data={data} />
            <RendezvousBadge data={data} />
            {/* Keeps the row actions grouped at the trailing edge. */}
            <Box flexGrow="1" />
            {/* Keyed off the request as shown, so previewing originals would
                point a think time override at a URL the script never requests. */}
            {!previewOriginalRequests && (
              <Flex justify="end" pr="2" css={{ flex: '0 0 96px' }}>
                <RowActions data={data} manualRequest={manualRequest} />
              </Flex>
            )}
          </Flex>
        </Table.Cell>
      </TableRow>

      <SearchResults
        data={data}
        key={data.id}
        onSelectRequest={onSelectRequest}
        filter={filter}
      />
    </>
  )
}
