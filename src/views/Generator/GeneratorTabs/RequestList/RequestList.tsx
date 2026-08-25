import { Box, Button, Flex, ScrollArea } from '@radix-ui/themes'
import { GlobeIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { EmptyMessage } from '@/components/EmptyMessage'
import { WebLogView } from '@/components/WebLogView'
import { useFilterRequests } from '@/components/WebLogView/Filter.hooks'
import { RequestListProps as RequestTableProps } from '@/components/WebLogView/WebLogView'
import { useProxyDataGroups } from '@/hooks/useProxyDataGroups'
import { useGeneratorStore } from '@/store/generator'
import { useApplyRules } from '@/store/generator/hooks/useApplyRules'
import { useHighlightRequestChanges } from '@/store/generator/hooks/useHighlightRequestChanges'
import { Group, ProxyData } from '@/types'

import { AddRequestButton, ImportPostmanButton } from '../../ApiRequest'
import { RecordingSelector } from '../../RecordingSelector'

import { Header } from './Header'
import { RequestTable } from './RequestTable'

interface RequestListProps {
  requests: ProxyData[]
  selectedRequest: ProxyData | null
  onSelectRequest: (request: ProxyData | null) => void
  onChangeRecording: (newPath: string) => void
}

export function RequestList({
  requests,
  selectedRequest,
  onSelectRequest,
  onChangeRecording,
}: RequestListProps) {
  const previewOriginalRequests = useGeneratorStore(
    (state) => state.previewOriginalRequests
  )

  const { requestsWithRulesApplied, selectedRuleInstance } = useApplyRules()

  const {
    filter,
    setFilter,
    filteredRequests,
    filterAllData,
    setFilterAllData,
  } = useFilterRequests({
    proxyData: previewOriginalRequests ? requests : requestsWithRulesApplied,
  })
  const allRequests = useGeneratorStore((state) => state.requests)
  const hasManualRequests = useGeneratorStore(
    (state) => state.manualRequests.length > 0
  )

  const usedGroups = useProxyDataGroups(requests)
  const emptyGroups = useGeneratorStore((state) => state.emptyGroups)
  const removeGroup = useGeneratorStore((state) => state.removeGroup)
  const renameGroup = useGeneratorStore((state) => state.renameGroup)

  // Groups are derived from the requests, so which one is being renamed can't
  // live on the group itself.
  const [editedGroup, setEditedGroup] = useState<string | null>(null)

  // Groups created by hand only show up while they hold no requests, after
  // that the requests themselves put them in the list.
  const groups = useMemo(
    () =>
      [
        ...usedGroups,
        ...emptyGroups
          .filter((name) => !usedGroups.some((group) => group.id === name))
          .map((name) => ({ id: name, name })),
      ].map((group) => ({ ...group, isEditing: group.id === editedGroup })),
    [usedGroups, emptyGroups, editedGroup]
  )

  // `id` is the current name, so a differing `name` means it was renamed.
  function handleUpdateGroup(group: Group) {
    setEditedGroup(group.isEditing ? group.id : null)

    if (!group.isEditing && group.name !== group.id) {
      renameGroup(group.id, group.name)
    }
  }

  const recordingError = useGeneratorStore((state) => state.recordingError)

  const allowlist = useGeneratorStore((store) => store.allowlist)

  const setShowAllowlistDialog = useGeneratorStore(
    (store) => store.setShowAllowlistDialog
  )

  const requestWithHighlights = useHighlightRequestChanges(filteredRequests)

  // A new function here would be a new component type, remounting every row
  // and dropping any popover a row has open.
  const ListComponent = useCallback(
    (props: RequestTableProps) => (
      <RequestTable {...props} selectedRuleInstance={selectedRuleInstance} />
    ),
    [selectedRuleInstance]
  )

  if (recordingError !== null && !hasManualRequests) {
    return (
      <EmptyMessage
        px="4"
        message="The selected recording could not be loaded, select another one from the dropdown"
        action={
          <RecordingSelector error onChangeRecording={onChangeRecording} />
        }
      ></EmptyMessage>
    )
  }

  if (allRequests.length === 0 && !hasManualRequests) {
    return (
      <EmptyMessage
        px="4"
        message="Select a recording from the dropdown, add a request by hand, or import a Postman collection"
        action={
          <Flex gap="2" align="center">
            <RecordingSelector onChangeRecording={onChangeRecording} />
            <AddRequestButton variant="soft" />
            <ImportPostmanButton variant="soft" />
          </Flex>
        }
      />
    )
  }

  if (allowlist.length === 0 && !hasManualRequests) {
    return (
      <EmptyMessage
        px="4"
        message="Get started by selecting hosts you'd like to work on"
        action={
          <Button onClick={() => setShowAllowlistDialog(true)}>
            <GlobeIcon />
            Select hosts
          </Button>
        }
      />
    )
  }

  if (filteredRequests.length === 0 && filter.trim() === '') {
    return (
      <EmptyMessage
        px="4"
        message="Selected hosts generated only static requests, enable static assets or select different hosts"
        action={
          <Button onClick={() => setShowAllowlistDialog(true)}>
            <GlobeIcon />
            Select hosts
          </Button>
        }
      />
    )
  }

  return (
    <Flex direction="column" height="100%">
      <Header
        filter={filter}
        filterAllData={filterAllData}
        setFilter={setFilter}
        setFilterAllData={setFilterAllData}
        onChangeRecording={onChangeRecording}
      />

      <ScrollArea scrollbars="vertical">
        <Box px="3" pb="3">
          <WebLogView
            requests={requestWithHighlights}
            selectedRequestId={selectedRequest?.id}
            onSelectRequest={onSelectRequest}
            groups={groups}
            filter={filter}
            groupVariant="card"
            onUpdateGroup={handleUpdateGroup}
            onRemoveGroup={({ name }) => removeGroup(name)}
            ListComponent={ListComponent}
          />
        </Box>
      </ScrollArea>
    </Flex>
  )
}
