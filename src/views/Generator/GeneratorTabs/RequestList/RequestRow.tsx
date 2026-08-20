import { Flex, IconButton } from '@radix-ui/themes'
import { PencilIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

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

import { ApiRequestDialog } from '../../ApiRequest'

import { RuleBadges } from './RuleBadges'

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
  const isManual = manualRequest !== undefined
  const removeManualRequest = useGeneratorStore(
    (store) => store.removeManualRequest
  )
  const [isEditing, setIsEditing] = useState(false)

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
          <Flex justify="between" align="center" height="100%" gap="1">
            <TextWithTooltip size="1">
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
            {isManual && (
              <IconButton
                aria-label="Edit request"
                variant="ghost"
                color="gray"
                size="1"
                onClick={(event) => {
                  event.stopPropagation()
                  setIsEditing(true)
                }}
              >
                <PencilIcon />
              </IconButton>
            )}
            {isManual && (
              <IconButton
                aria-label="Remove request"
                variant="ghost"
                color="gray"
                size="1"
                mr="1"
                onClick={(event) => {
                  event.stopPropagation()
                  removeManualRequest(data.id)
                }}
              >
                <Trash2Icon />
              </IconButton>
            )}
          </Flex>
        </Table.Cell>
      </TableRow>

      {/* Mounted only while editing so the form picks up the current request. */}
      {isEditing && (
        <ApiRequestDialog
          open
          request={manualRequest}
          onOpenChange={setIsEditing}
        />
      )}

      <SearchResults
        data={data}
        key={data.id}
        onSelectRequest={onSelectRequest}
        filter={filter}
      />
    </>
  )
}
