import { DropdownMenu, Flex } from '@radix-ui/themes'
import {
  EllipsisIcon,
  FolderInputIcon,
  PencilIcon,
  TimerIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { IconButtonWithTooltip } from '@/components/IconButtonWithTooltip'
import { PopoverDialog } from '@/components/PopoverDialogs'
import { useGeneratorStore } from '@/store/generator'
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
  // Only requests added by hand can be sent again, edited, moved or removed.
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
  const groupNames = useGroupNames()
  const key = requestKey(data)
  const isRendezvous = useGeneratorStore((store) => store.rendezvous[key])
  const toggleRendezvous = useGeneratorStore((store) => store.toggleRendezvous)

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
            {manualRequest && (
              <>
                <SendAgainButton request={manualRequest} />
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

                {manualRequest && (
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
                            disabled={group === manualRequest.group}
                            onSelect={() =>
                              updateManualRequest(manualRequest.id, {
                                ...manualRequest,
                                group,
                              })
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

                    <DropdownMenu.Separator />

                    <DropdownMenu.Item
                      color="red"
                      onSelect={() => removeManualRequest(manualRequest.id)}
                    >
                      <Trash2Icon />
                      Remove request
                    </DropdownMenu.Item>
                  </>
                )}
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
      {isEditingRequest && manualRequest && (
        <ApiRequestDialog
          open
          request={manualRequest}
          onOpenChange={setIsEditingRequest}
        />
      )}
    </>
  )
}
