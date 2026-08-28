import { Button, Dialog, Flex, Text, TextArea } from '@radix-ui/themes'
import { useState } from 'react'

import { useGeneratorStore } from '@/store/generator'
import { useToast } from '@/store/ui/useToast'
import { createFixedTiming } from '@/utils/thinkTime'

import { toProxyData } from './ApiRequest.utils'
import { parseVuGen } from './parseVuGen'

interface ImportVuGenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-filled source, so a script already pasted into the C tab is reused. */
  initialSource?: string
  onImported?: () => void
}

/**
 * Paste `Action.c` and get its steps as requests. LoadRunner scripts hold no
 * responses, so correlation and recorded-value assertions have nothing to read
 * — the toast says so, since it is the one thing that surprises people.
 */
export function ImportVuGenDialog({
  open,
  onOpenChange,
  initialSource = '',
  onImported,
}: ImportVuGenDialogProps) {
  const [source, setSource] = useState(initialSource)
  const replaceImportedRequests = useGeneratorStore(
    (store) => store.replaceImportedRequests
  )
  // Shown on the button so replacing is never a surprise.
  const alreadyImported = useGeneratorStore(
    (store) =>
      store.manualRequests.filter((request) => request.source === 'vugen')
        .length
  )
  const setThinkTimeOverride = useGeneratorStore(
    (store) => store.setThinkTimeOverride
  )
  const toggleRendezvous = useGeneratorStore((store) => store.toggleRendezvous)
  const showToast = useToast()

  function handleImport() {
    const result = parseVuGen(source)

    if (result === null) {
      showToast({
        title: 'Could not read the script',
        description:
          'Paste a VuGen action containing web_url, web_custom_request or web_submit_data steps.',
        status: 'error',
      })
      return
    }

    const { requests, skipped, droppedThinkTime } = result

    if (requests.length === 0) {
      showToast({
        title: 'No requests imported',
        description: describeSkipped(skipped),
        status: 'error',
      })
      return
    }

    // Replaced in one go rather than appended one by one: pasting an edited
    // script means its previous requests are stale, and appending them again
    // is what silently doubled every transaction.
    replaceImportedRequests(
      'vugen',
      requests.map((request) => ({ ...toProxyData(request), source: 'vugen' }))
    )

    for (const request of requests) {
      // Overrides are keyed by `requestKey`, not by the generated request id.
      const key = `${request.method} ${request.url}`

      if (request.thinkTime !== null) {
        setThinkTimeOverride(key, createFixedTiming(request.thinkTime))
      }

      if (request.rendezvous) {
        toggleRendezvous(key)
      }
    }

    showToast({
      title: `Imported ${count(requests.length, 'request')}`,
      description: [
        alreadyImported > 0
          ? `${count(alreadyImported, 'request')} from the previous import replaced.`
          : '',
        'LoadRunner scripts carry no responses, so add correlation rules by hand.',
        skipped > 0 ? describeSkipped(skipped) : '',
        droppedThinkTime > 0
          ? `${count(droppedThinkTime, 'lr_think_time call')} between transactions dropped: keeping them would add their seconds to the transaction above.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      status: 'success',
    })

    setSource('')
    onImported?.()
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="3" maxWidth="800px">
        <Dialog.Title>Import LoadRunner script</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Paste the body of a VuGen action. Transactions become groups,
          lr_think_time and lr_rendezvous become per-request options, and
          EXTRARES sub-resources are left out.
          {alreadyImported > 0 &&
            ' Importing replaces the requests from your last LoadRunner import; requests you added by hand are kept.'}
        </Dialog.Description>

        <TextArea
          size="2"
          rows={16}
          spellCheck={false}
          placeholder={
            'Action()\n{\n\tweb_url("home", "URL=https://…", LAST);\n}'
          }
          value={source}
          onChange={(event) => setSource(event.target.value)}
          css={{ fontFamily: 'var(--code-font-family)' }}
        />

        <Flex gap="3" mt="4" justify="end" align="center">
          <Text size="1" color="gray" mr="auto">
            No responses are imported — correlation must be added afterwards.
          </Text>
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button disabled={source.trim() === ''} onClick={handleImport}>
            {alreadyImported > 0
              ? `Replace ${count(alreadyImported, 'request')}`
              : 'Import'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function describeSkipped(skipped: number) {
  return `${count(skipped, 'step')} skipped: EXTRARES sub-resources, a relative URL, or an unsupported method.`
}

function count(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}
