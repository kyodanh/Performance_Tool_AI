import { Badge, Tooltip } from '@radix-ui/themes'
import { TimerIcon } from 'lucide-react'

import { useGeneratorStore } from '@/store/generator'
import { ProxyData } from '@/types'
import { formatTiming, requestKey } from '@/utils/thinkTime'

/**
 * Marks a request that waits for its own think time instead of the global one.
 * Editing it lives in the row's More actions menu.
 */
export function ThinkTimeBadge({ data }: { data: ProxyData }) {
  const override = useGeneratorStore(
    (state) => state.thinkTimeOverrides[requestKey(data)]
  )

  if (!override) {
    return null
  }

  return (
    <Tooltip content="Think time for this request">
      <Badge color="gray" size="1">
        <TimerIcon size={12} />
        {formatTiming(override)}
      </Badge>
    </Tooltip>
  )
}
