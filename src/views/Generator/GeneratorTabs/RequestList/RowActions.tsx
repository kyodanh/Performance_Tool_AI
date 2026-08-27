import { Button, DropdownMenu, Flex } from '@radix-ui/themes'
import {
  EllipsisIcon,
  FolderInputIcon,
  PencilIcon,
  RotateCcwIcon,
  TimerIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { IconButtonWithTooltip } from '@/components/IconButtonWithTooltip'
import { PopoverDialog } from '@/components/PopoverDialogs'
import { useGeneratorStore } from '@/store/generator'
import { useToast } from '@/store/ui/useToast'
import { ProxyData } from '@/types'
import { requestKey } from '@/utils/thinkTime'

import { ApiRequestDialog, useGroupNames } from '../../ApiRequest'

import {
  ButtonGroupDivider,
  buttonGroupCss,
  buttonGroupIconCss,
} from './ButtonGroup'
import { SendAgainButton } from './SendAgainButton'
import { ThinkTimeForm } from './ThinkTimeForm'

interface RowActionsProps {
  data: ProxyData
  // Set when the row is a request added by hand rather than a recorded one.
  manualRequest?: ProxyData
}

/**
 * Every row action in one segmented control: sending is the common one, the
 * rest sit behind More actions to keep the column narrow.
 */
export function RowActions({ data, manualRequest }: RowActionsProps) {
  const updateManualRequest = useGeneratorStore(
    (store) => store.updateManualRequest
  )
  const removeManualRequest = useGeneratorStore(
    (store) => store.removeManualRequest
  )
  const setRequestOverride = useGeneratorStore(
    (store) => store.setRequestOverride
  )
  const clearRequestOverride = useGeneratorStore(
    (store) => store.clearRequestOverride
  )
  const toggleExcludedRequest = useGeneratorStore(
    (store) => store.toggleExcludedRequest
  )
  const showToast = useToast()
  const groupNames = useGroupNames()
  const key = requestKey(data)
  const isRendezvous = useGeneratorStore((store) => store.rendezvous[key])
  const toggleRendezvous = useGeneratorStore((store) => store.toggleRendezvous)

  // Edits to a recorded request are stored against the request as recorded, so
  // the key has to come from that rather than from the row, which carries both
  // the rules and any earlier edit.
  const recorded = useGeneratorStore((store) =>
    store.requests.find((request) => request.id === data.id)
  )
  const overrideKey = recorded ? requestKey(recorded) : null
  const override = useGeneratorStore((store) =>
    overrideKey ? store.requestOverrides[overrideKey] : undefined
  )
  // What an edit starts from and writes back to: the stored request, never the
  // row, which has rules applied to it.
  const editedRequest = manualRequest ?? override ?? recorded

  const [isEditingThinkTime, setIsEditingThinkTime] = useState(false)
  const [isEditingRequest, setIsEditingRequest] = useState(false)
  const pendingSelection = useRef<(() => void) | null>(null)

  // Two things would close a layer opened straight from the menu: the click
  // that selected the item, and the focus the menu hands back to its trigger.
  // Running the selection once the menu is gone, with the focus handoff
  // suppressed, avoids both.
  function handleCloseAutoFocus(event: Event) {
    const selection = pendingSelection.current

    if (selection === null) {
      return
    }

    event.preventDefault()
    pendingSelection.current = null
    setTimeout(selection)
  }

  // A manual request lives in its own list, so it is edited in place. A
  // recorded one belongs to the HAR, so the edit is stored as an override that
  // shadows it.
  function handleSave(request: ProxyData) {
    if (manualRequest) {
      updateManualRequest(manualRequest.id, request)
      return
    }

    if (overrideKey) {
      setRequestOverride(overrideKey, request)
    }
  }

  // A manual request is stored in the generator, so removing it drops it for
  // good. A recorded one belongs to the HAR: it can only be excluded, and the
  // exclusion is keyed so it survives reloading the recording - hence the undo.
  function handleRemove() {
    if (manualRequest) {
      removeManualRequest(manualRequest.id)
      return
    }

    toggleExcludedRequest(key)
    showToast({
      title: 'Request removed from the test',
      action: (
        <Button variant="ghost" onClick={() => toggleExcludedRequest(key)}>
          Undo
        </Button>
      ),
    })
  }

  return (
    <>
      <PopoverDialog
        open={isEditingThinkTime}
        onOpenChange={setIsEditingThinkTime}
        width="280px"
        anchor={
          // The row is clickable, so its actions must not select it.
          <Flex
            align="center"
            css={buttonGroupCss}
            onClick={(event) => event.stopPropagation()}
          >
            {editedRequest && (
              <>
                <SendAgainButton request={editedRequest} onSent={handleSave} />
                <ButtonGroupDivider />
              </>
            )}

            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButtonWithTooltip
                  tooltip="More actions"
                  variant="ghost"
                  color="gray"
                  size="1"
                  css={buttonGroupIconCss}
                >
                  <EllipsisIcon />
                </IconButtonWithTooltip>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content
                size="1"
                align="end"
                onCloseAutoFocus={handleCloseAutoFocus}
              >
                <DropdownMenu.Item
                  onSelect={() => {
                    pendingSelection.current = () => setIsEditingThinkTime(true)
                  }}
                >
                  <TimerIcon />
                  Think time
                </DropdownMenu.Item>

                <DropdownMenu.CheckboxItem
                  checked={isRendezvous === true}
                  onCheckedChange={() => toggleRendezvous(key)}
                >
                  <UsersIcon />
                  Rendezvous
                </DropdownMenu.CheckboxItem>

                {editedRequest && (
                  <>
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger>
                        <FolderInputIcon />
                        Move to group
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.SubContent>
                        {groupNames.map((group) => (
                          <DropdownMenu.Item
                            key={group}
                            disabled={group === editedRequest.group}
                            onSelect={() =>
                              handleSave({ ...editedRequest, group })
                            }
                          >
                            {group}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Sub>

                    <DropdownMenu.Item
                      onSelect={() => {
                        pendingSelection.current = () =>
                          setIsEditingRequest(true)
                      }}
                    >
                      <PencilIcon />
                      Edit request
                    </DropdownMenu.Item>
                  </>
                )}

                {override && overrideKey && (
                  <DropdownMenu.Item
                    onSelect={() => clearRequestOverride(overrideKey)}
                  >
                    <RotateCcwIcon />
                    Revert to recorded
                  </DropdownMenu.Item>
                )}

                <DropdownMenu.Separator />

                <DropdownMenu.Item color="red" onSelect={handleRemove}>
                  <Trash2Icon />
                  Remove request
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </Flex>
        }
      >
        <ThinkTimeForm
          data={data}
          onClear={() => setIsEditingThinkTime(false)}
        />
      </PopoverDialog>

      {/* Mounted only while editing so the form picks up the current request. */}
      {isEditingRequest && editedRequest && (
        <ApiRequestDialog
          open
          request={editedRequest}
          onSave={handleSave}
          onOpenChange={setIsEditingRequest}
        />
      )}
    </>
  )
}
