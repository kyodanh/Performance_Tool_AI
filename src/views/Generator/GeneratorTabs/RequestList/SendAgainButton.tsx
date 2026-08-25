import { SendIcon } from 'lucide-react'
import { useState } from 'react'

import { IconButtonWithTooltip } from '@/components/IconButtonWithTooltip'
import { useGeneratorStore } from '@/store/generator'
import { useToast } from '@/store/ui/useToast'
import { ProxyData } from '@/types'

import {
  fromProxyData,
  toProxyData,
  toSendOptions,
} from '../../ApiRequest/ApiRequest.utils'
import { useCorrelationVariables } from '../../ApiRequest/useCorrelationVariables'

import { buttonGroupIconCss } from './ButtonGroup'

/**
 * The stored response only describes the request as it was sent, so adding a
 * correlation rule afterwards leaves a stale status in the list. Sending again
 * resolves `{variables}` against the values the rules extract now.
 *
 * ponytail: separate component so `useCorrelationVariables` (which applies all
 * rules) only runs for manual rows instead of every row in the recording.
 */
export function SendAgainButton({ request }: { request: ProxyData }) {
  const updateManualRequest = useGeneratorStore(
    (store) => store.updateManualRequest
  )
  const variables = useCorrelationVariables()
  const showToast = useToast()
  const [isSending, setIsSending] = useState(false)

  async function handleClick() {
    const formData = fromProxyData(request)

    setIsSending(true)
    const result = await window.studio.httpRequest.send(
      toSendOptions(formData, variables)
    )
    setIsSending(false)

    if (result.type === 'error') {
      showToast({
        title: 'Request failed',
        description: result.message,
        status: 'error',
      })
      return
    }

    updateManualRequest(
      request.id,
      toProxyData(formData, result.response, request.id)
    )
  }

  return (
    <IconButtonWithTooltip
      tooltip="Send request again"
      variant="ghost"
      color="gray"
      size="1"
      css={buttonGroupIconCss}
      loading={isSending}
      onClick={(event) => {
        event.stopPropagation()
        void handleClick()
      }}
    >
      <SendIcon />
    </IconButtonWithTooltip>
  )
}
