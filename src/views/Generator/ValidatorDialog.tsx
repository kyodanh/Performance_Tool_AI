import { css } from '@emotion/react'
import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  Spinner,
  Text,
} from '@radix-ui/themes'
import { CircleCheckBigIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { EmptyMessage } from '@/components/EmptyMessage'
import { ProxyHealthBadge } from '@/components/ProxyHealthWarning'
import {
  checkTotals,
  resolveChecks,
  RunSummaryBar,
} from '@/components/Validator/RunSummaryBar'
import { useListenProxyData } from '@/hooks/useListenProxyData'
import { useProxyHealthCheck } from '@/hooks/useProxyHealthCheck'
import { useProxyStatus } from '@/hooks/useProxyStatus'
import { useRunChecks } from '@/hooks/useRunChecks'
import { useRunLogs } from '@/hooks/useRunLogs'
import { useRunStats } from '@/hooks/useRunStats'
import {
  selectFilteredRequests,
  selectGeneratorData,
  useGeneratorStore,
} from '@/store/generator'
import { ValidatorResult } from '@/views/Generator/ValidatorResult'

import { generateScriptPreview } from './Generator.utils'

interface ValidatorDialogProps {
  script: string
  /** Shown under the title, so the reader knows which script ran. */
  name?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ValidatorDialog({
  script,
  name,
  open,
  onOpenChange,
}: ValidatorDialogProps) {
  const [isRunning, setIsRunning] = useState(false)
  const { proxyData, resetProxyData } = useListenProxyData()
  const { logs, resetLogs } = useRunLogs()
  const { checks, resetChecks } = useRunChecks()
  const { stats, resetStats } = useRunStats()

  const resetState = useCallback(() => {
    resetLogs()
    resetProxyData()
    resetChecks()
    resetStats()
  }, [resetChecks, resetLogs, resetStats, resetProxyData])

  // Passing the status keeps the check from polling (and log-spamming
  // ECONNREFUSED) while the proxy is still starting.
  const { isProxyHealthy } = useProxyHealthCheck(useProxyStatus())

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        window.studio.script.stopScript()
        setIsRunning(false)
        resetState()
      }

      onOpenChange(open)
    },
    [onOpenChange, resetState]
  )

  const handleRunScript = useCallback(async () => {
    resetState()
    setIsRunning(true)

    const scriptPath = await window.studio.fs.getTempScriptPath()

    const state = useGeneratorStore.getState()
    const generator = selectGeneratorData(state)
    const recording = selectFilteredRequests(state)

    const generated = await generateScriptPreview(
      scriptPath,
      generator,
      recording
    )

    await window.studio.script.runScriptFromGenerator({
      content: generated,
      path: scriptPath,
    })
  }, [resetState])

  useEffect(() => {
    if (!open) return

    // TODO: https://github.com/grafana/k6-studio/issues/277
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    handleRunScript()
  }, [open, handleRunScript])

  useEffect(() => {
    return window.studio.script.onScriptFinished(() => {
      setIsRunning(false)
    })
  }, [])

  useEffect(() => {
    return window.studio.script.onScriptFailed(() => {
      setIsRunning(false)
    })
  }, [])

  const verdict = useMemo(
    () => runVerdict(isRunning, checkTotals(resolveChecks(checks, stats))),
    [isRunning, checks, stats]
  )

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content
        maxWidth="95vw"
        height="85vh"
        size="2"
        asChild
        css={css`
          padding: 0;
        `}
      >
        <Flex direction="column">
          <Flex
            align="center"
            gap="3"
            px="4"
            flexShrink="0"
            css={css`
              height: 68px;
              border-bottom: 1px solid var(--gray-5);
            `}
          >
            <Flex
              align="center"
              justify="center"
              flexShrink="0"
              css={css`
                width: 34px;
                height: 34px;
                border-radius: var(--radius-3);
                background-color: var(--accent-3);
                color: var(--accent-11);
              `}
            >
              <CircleCheckBigIcon size={18} />
            </Flex>
            <Flex direction="column" minWidth="0">
              <Dialog.Title size="4" mb="0" truncate>
                Validator
              </Dialog.Title>
              {name !== undefined && (
                <Text size="1" color="gray" truncate>
                  {name}
                </Text>
              )}
            </Flex>
            {isRunning && <Spinner />}
            {verdict !== null && (
              <Badge color={verdict.color} radius="full" size="2">
                {verdict.label}
              </Badge>
            )}
            {!isProxyHealthy && <ProxyHealthBadge />}
            <Box flexGrow="1" />
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
            <Button loading={isRunning} onClick={handleRunScript}>
              Re-run script
            </Button>
          </Flex>

          <Box
            flexShrink="0"
            css={css`
              border-bottom: 1px solid var(--gray-5);
            `}
          >
            <RunSummaryBar
              requestCount={proxyData.length}
              checks={checks}
              stats={stats}
            />
          </Box>

          <Box flexGrow="1" minHeight="0">
            <ValidatorResult
              script={script}
              proxyData={proxyData}
              logs={logs}
              checks={checks}
              stats={stats}
              noDataElement={
                <EmptyMessage message="Requests will appear here" />
              }
              isRunning={isRunning}
            />
          </Box>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function runVerdict(
  isRunning: boolean,
  { passes, fails }: { passes: number; fails: number }
) {
  if (isRunning) {
    return { label: 'Running', color: 'gray' } as const
  }

  if (passes + fails === 0) {
    return null
  }

  return fails === 0
    ? ({ label: 'All checks passed', color: 'green' } as const)
    : ({ label: `${fails} checks failed`, color: 'red' } as const)
}
