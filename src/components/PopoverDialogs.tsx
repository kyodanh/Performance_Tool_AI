import { Popover } from '@radix-ui/themes'

type PopoverDialogProps = Popover.RootProps & {
  children: React.ReactNode
  trigger?: React.ReactNode
  // What to position against when the popover is opened from elsewhere, e.g.
  // a menu item, and so has no trigger of its own.
  anchor?: React.ReactNode
  width?: string
  align?: 'start' | 'end' | 'center'
}
export function PopoverDialog({
  children,
  trigger,
  anchor,
  width = '400px',
  align = 'end',
  ...rest
}: PopoverDialogProps) {
  return (
    <Popover.Root {...rest}>
      {trigger && <Popover.Trigger>{trigger}</Popover.Trigger>}
      {anchor}
      {/* Radix Themes' Anchor drops its children, so it can only mark where
          the content should be positioned — right after the anchor content. */}
      {anchor && <Popover.Anchor />}
      <Popover.Content
        width={width}
        maxWidth={width}
        size="1"
        side="bottom"
        align={align}
        avoidCollisions
        // The content is portalled but React still bubbles its events up the
        // component tree, so a popover opened from a clickable row would
        // trigger that row on every click inside it.
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </Popover.Content>
    </Popover.Root>
  )
}
