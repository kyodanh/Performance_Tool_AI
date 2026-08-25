import { Badge, Tooltip } from '@radix-ui/themes'
import { UsersIcon } from 'lucide-react'

import { useGeneratorStore } from '@/store/generator'
import { ProxyData } from '@/types'
import { requestKey } from '@/utils/thinkTime'

/**
 * Marks a request every VU waits at before firing. Toggling it lives in the
 * row's More actions menu.
 */
export function RendezvousBadge({ data }: { data: ProxyData }) {
  const isRendezvous = useGeneratorStore(
    (state) => state.rendezvous[requestKey(data)]
  )

  if (!isRendezvous) {
    return null
  }

  return (
    <Tooltip content="All VUs meet here before this request">
      <Badge color="gray" size="1">
        <UsersIcon size={12} />
        Rendezvous
      </Badge>
    </Tooltip>
  )
}
