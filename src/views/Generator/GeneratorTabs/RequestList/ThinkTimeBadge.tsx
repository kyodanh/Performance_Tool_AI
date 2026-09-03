import { Badge, Tooltip } from '@radix-ui/themes'
import { TimerIcon, TimerOffIcon } from 'lucide-react'

import { useGeneratorStore } from '@/store/generator'
import { ProxyData } from '@/types'
import { formatTiming, requestKey } from '@/utils/thinkTime'

/**
 * Marks a request that waits for its own think time instead of the global one.
 * Editing it lives in the row's More actions menu.
 *
 * The override only runs when Test options put think time between requests —
 * anywhere else the sleep would sit inside the transaction and be reported as
 * response time, so it is skipped and the badge says so rather than letting
 * the row claim a wait the script never makes.
 */
export function ThinkTimeBadge({ data }: { data: ProxyData }) {
  const override = useGeneratorStore(
    (state) => state.thinkTimeOverrides[requestKey(data)]
  )
  const sleepType = useGeneratorStore((state) => state.sleepType)

  if (!override) {
    return null
  }

  const active = sleepType === 'requests'

  return (
    <Tooltip
      content={
        active
          ? 'Think time for this request'
          : 'Ignored: Test options place think time outside the group'
      }
    >
      <Badge color="gray" size="1" variant={active ? undefined : 'outline'}>
        {active ? <TimerIcon size={12} /> : <TimerOffIcon size={12} />}
        {formatTiming(override)}
      </Badge>
    </Tooltip>
  )
}
