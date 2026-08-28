import { css } from '@emotion/react'
import { ScrollArea, ScrollAreaProps } from '@radix-ui/themes'
import { ReactNode, UIEvent, useRef, useState } from 'react'

import { useAutoScroll } from '@/hooks/useAutoScroll'

const BOTTOM_THRESHOLD = 10

/**
 * Whether tailing should stay on. Scrolling up away from the bottom means the
 * user is reading, so tailing pauses; coming back to the bottom resumes it.
 * Returns the unchanged value while the user is not moving away or back.
 */
export function nextPinnedState(
  pinned: boolean,
  { scrollTop, previousScrollTop, scrollHeight, clientHeight }: ScrollPosition
) {
  const isAtBottom = scrollHeight - scrollTop <= clientHeight + BOTTOM_THRESHOLD

  if (isAtBottom) {
    return true
  }

  return scrollTop < previousScrollTop ? false : pinned
}

interface ScrollPosition {
  scrollTop: number
  previousScrollTop: number
  scrollHeight: number
  clientHeight: number
}

interface AutoScrollAreaProps extends Omit<ScrollAreaProps, 'onScroll'> {
  tail?: boolean
  items?: unknown
  children?: ReactNode
  onScrollBack?: () => void
}

export function AutoScrollArea({
  tail = false,
  items,
  children,
  onScrollBack,
  ...props
}: AutoScrollAreaProps) {
  // Tailing pauses while the user reads further up, otherwise every new item
  // yanks the view back to the bottom mid-read.
  const [pinned, setPinned] = useState(true)
  const ref = useAutoScroll(items, tail && pinned)
  const scrollTop = useRef<number>(0)

  const handleMount = (el: HTMLDivElement | null) => {
    ref.current = el

    if (el === null) {
      return
    }

    scrollTop.current = el.scrollTop
  }

  const handleScroll = ({ currentTarget: target }: UIEvent<HTMLDivElement>) => {
    if (!tail) {
      return
    }

    const next = nextPinnedState(pinned, {
      scrollTop: target.scrollTop,
      previousScrollTop: scrollTop.current,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
    })

    if (next !== pinned) {
      setPinned(next)

      if (!next) {
        onScrollBack?.()
      }
    }

    scrollTop.current = target.scrollTop
  }

  return (
    <ScrollArea {...props} onScroll={handleScroll}>
      <div
        ref={handleMount}
        css={css`
          height: 100%;
        `}
      >
        {children}
      </div>
    </ScrollArea>
  )
}
