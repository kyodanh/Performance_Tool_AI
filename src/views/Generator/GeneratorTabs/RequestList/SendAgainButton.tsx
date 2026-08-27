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
import { resolveRequestVariables } from '../../ApiRequest/useCorrelationVariables'

import { buttonGroupIconCss } from './ButtonGroup'

interface SendAgainButtonProps {
  request: ProxyData
  // Where the fresh response is stored, since a recorded request keeps it in an
  // override while a manual one keeps it in its own list.
  onSent: (request: ProxyData) => void
}

/**
 * The stored response only describes the request as it was sent, so adding a
 * correlation rule afterwards leaves a stale status in the list. Sending again
 * resolves `{variables}` against the values the rules extract now.
 */
export function SendAgainButton({ request, onSent }: SendAgainButtonProps) {
  const showToast = useToast()
  const [isSending, setIsSending] = useState(false)

  async function handleClick() {
    const formData = fromProxyData(request)
    const variables = await resolveRequestVariables(
      useGeneratorStore.getState()
    )

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

    onSent(toProxyData(formData, result.response, request.id))
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
