import {
  Badge,
  Box,
  Button,
  Callout,
  Code,
  Dialog,
  Flex,
  IconButton,
  Text,
} from '@radix-ui/themes'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, CopyIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useToast } from '@/store/ui/useToast'

interface CommandProps {
  label: string
  command: string
}

function Command({ label, command }: CommandProps) {
  const [copied, setCopied] = useState(false)
  const showToast = useToast()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      showToast({
        title: 'Could not copy the command',
        description: error instanceof Error ? error.message : undefined,
        status: 'error',
      })
    }
  }

  return (
    <Box mb="3">
      <Text size="1" color="gray" as="p" mb="1">
        {label}
      </Text>
      <Flex gap="2" align="center">
        <Code
          size="2"
          variant="soft"
          style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}
        >
          {command}
        </Code>
        <IconButton
          size="2"
          variant="soft"
          aria-label={`Copy ${label} command`}
          onClick={() => void handleCopy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
      </Flex>
    </Box>
  )
}

interface AddLoadGeneratorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Number of generators in the pool, used to confirm a machine has joined. */
  count: number
}

/** `m:ss` left, or null once the deadline has passed. */
function useCountdown(expiresAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(timer)
  }, [])

  if (expiresAt === undefined) {
    return null
  }

  const seconds = Math.max(0, Math.round((expiresAt - now) / 1000))

  if (seconds === 0) {
    return null
  }

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function AddLoadGeneratorDialog({
  open,
  onOpenChange,
  count,
}: AddLoadGeneratorDialogProps) {
  const queryClient = useQueryClient()

  // Starting the server is what produces the code, so the dialog opening is what
  // brings it up — nothing listens until the user asks to add a machine.
  const { data: enrollment, error } = useQuery({
    queryKey: ['load-generator-enrollment'],
    enabled: open,
    staleTime: Infinity,
    queryFn: () => window.studio.loadGenerator.enroll(),
  })

  const remaining = useCountdown(enrollment?.expiresAt)

  // An expired code is worse than no code: it fails on the other machine with
  // nothing to explain why. Fetching again rotates it.
  useEffect(() => {
    if (open && enrollment !== undefined && remaining === null) {
      void queryClient.invalidateQueries({
        queryKey: ['load-generator-enrollment'],
      })
    }
  }, [enrollment, open, queryClient, remaining])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="640px">
        <Dialog.Title>Add load generator</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Run one line on the machine that should generate load. It prints its
          IP and status, then shows up in the list below.
        </Dialog.Description>

        {error && (
          <Callout.Root size="1" color="red">
            <Callout.Icon>
              <TriangleAlertIcon />
            </Callout.Icon>
            <Callout.Text>{error.message}</Callout.Text>
          </Callout.Root>
        )}

        {enrollment && (
          <>
            <Command label="macOS, Linux" command={enrollment.posixCommand} />
            <Command
              label="Windows — CMD or PowerShell, no administrator rights"
              command={enrollment.windowsCommand}
            />

            <Callout.Root size="1" mb="3">
              <Callout.Icon>
                <InfoIcon />
              </Callout.Icon>
              <Callout.Text>
                The machine needs no k6 install and no open inbound port — it
                downloads the matching k6 and calls back to this controller.
              </Callout.Text>
            </Callout.Root>

            <Flex align="center" gap="2">
              <Badge color={count > 0 ? 'green' : 'gray'}>
                {count > 0
                  ? `${count} generator${count === 1 ? '' : 's'} joined`
                  : 'Waiting for a machine to join…'}
              </Badge>
              <Text size="1" color="gray">
                code {enrollment.key} ·{' '}
                {remaining === null
                  ? 'expired, fetching a new one…'
                  : `expires in ${remaining}`}
              </Text>
            </Flex>
          </>
        )}

        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft">Done</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
