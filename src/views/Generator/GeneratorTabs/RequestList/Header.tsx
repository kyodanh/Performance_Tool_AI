import { Button, Flex, Separator, Switch, Text } from '@radix-ui/themes'
import { Undo2Icon } from 'lucide-react'

import { Filter } from '@/components/WebLogView/Filter'
import { useGeneratorStore } from '@/store/generator'

import { RecordingSelector } from '../../RecordingSelector'

import { RequestActions } from './RequestActions'

interface HeaderProps {
  filter: string
  filterAllData?: boolean
  setFilter: (filter: string) => void
  setFilterAllData: (filterAllData: boolean) => void
  onChangeRecording: (newPath: string) => void
}

export function Header({
  filter,
  setFilter,
  filterAllData,
  setFilterAllData,
  onChangeRecording,
}: HeaderProps) {
  const previewOriginalRequests = useGeneratorStore(
    (state) => state.previewOriginalRequests
  )

  const setPreviewOriginalRequests = useGeneratorStore(
    (store) => store.setPreviewOriginalRequests
  )

  const removedCount = useGeneratorStore(
    (store) => store.excludedRequests.length
  )
  const restoreExcludedRequests = useGeneratorStore(
    (store) => store.restoreExcludedRequests
  )

  return (
    <Flex justify="between" align="center" px="3" py="2" gap="2">
      <Flex gap="2" align="center">
        <Text size="2" weight="medium" as="label" htmlFor="recording-selector">
          Recording
        </Text>
        <RecordingSelector
          id="recording-selector"
          onChangeRecording={onChangeRecording}
        />
        <Separator orientation="vertical" size="1" mx="1" />
        <RequestActions />
        {/* Removing a recorded request only excludes it, so the way back has
            to stay visible - the rows themselves are gone. */}
        {removedCount > 0 && (
          <Button
            variant="ghost"
            color="gray"
            size="1"
            onClick={restoreExcludedRequests}
          >
            <Undo2Icon />
            Restore {removedCount} removed
          </Button>
        )}
      </Flex>

      <Flex justify="end" align="center" gap="4">
        <Text
          as="label"
          size="1"
          color={previewOriginalRequests ? undefined : 'gray'}
          css={{ whiteSpace: 'nowrap' }}
        >
          <Flex gap="2">
            <Switch
              size="1"
              checked={previewOriginalRequests}
              onCheckedChange={setPreviewOriginalRequests}
            />
            View original requests
          </Flex>
        </Text>

        <Filter
          filter={filter}
          setFilter={setFilter}
          css={{
            width: '300px',
          }}
          size="2"
          filterAllData={filterAllData}
          setFilterAllData={setFilterAllData}
        />
      </Flex>
    </Flex>
  )
}
