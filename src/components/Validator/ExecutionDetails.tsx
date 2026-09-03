import { css } from '@emotion/react'
import { Tabs } from '@radix-ui/themes'
import { useEffect, useMemo, useState } from 'react'

import { useTrackScriptCopy } from '@/hooks/useTrackScriptCopy'
import { Check, LogEntry } from '@/schemas/k6'
import { MachineResources } from '@/types/systemMetrics'
import { runSummary, RunStats } from '@/utils/k6/stats'

import { ReadOnlyEditor } from '../Monaco/ReadOnlyEditor'

import { AiAnalysis } from './AiAnalysis'
import { ChecksSection } from './ChecksSection'
import { checksFromStats } from './ChecksSection.utils'
import { FailedSection, failureCount, hasFailures } from './FailedSection'
import { LogsSection, useConsoleFilter } from './LogsSection'
import { MetricsSection } from './MetricsSection'

/**
 * The row starts below the panel's resize separator rather than flush against
 * it, so a drag never runs the grip through the pills.
 */
const toolbarStyles = css`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-2);
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--gray-a4);
`

/**
 * Each tab is its own pill rather than a segment of one container, so the row
 * reads as a filter bar and a disabled tab simply fades out of it.
 */
const tabPillStyles = css`
  box-shadow: none;
  gap: var(--space-2);

  /* a pill has no underline indicator */
  & > button::before {
    display: none;
  }

  & > button {
    height: 34px;
    padding: 0;
    color: var(--gray-11);
    font-size: var(--font-size-2);
    font-weight: 600;
  }

  /*
   * Radix sizes the trigger from a hidden copy of the label and lays the
   * visible one over it absolutely, so the pill only centres its text once it
   * is given the trigger's full height itself.
   */
  & > button .rt-BaseTabListTriggerInner,
  & > button .rt-BaseTabListTriggerInnerHidden {
    height: 34px;
    padding: 0 var(--space-4);
    line-height: 1;
  }

  & > button .rt-BaseTabListTriggerInner {
    border-radius: 9999px;
    background-color: var(--gray-3);
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  & > button:not([disabled]):hover .rt-BaseTabListTriggerInner {
    background-color: var(--gray-4);
  }

  & > button[disabled] .rt-BaseTabListTriggerInner {
    background-color: var(--gray-2);
  }

  & > button[data-state='active'] {
    color: var(--accent-contrast);
  }

  & > button[data-state='active'] .rt-BaseTabListTriggerInner,
  & > button[data-state='active']:hover .rt-BaseTabListTriggerInner {
    background-color: var(--accent-9);
    box-shadow: 0 2px 8px -4px var(--accent-a8);
  }
`

const aiButtonStyles = css`
  flex-shrink: 0;
`

type Tab = 'logs' | 'checks' | 'failed' | 'metrics' | 'script'

const TABS: Tab[] = ['logs', 'checks', 'failed', 'metrics', 'script']

interface ExecutionDetailsProps {
  isRunning: boolean
  script?: string
  logs: LogEntry[]
  checks: Check[]
  stats?: RunStats | null
  /** Machine CPU/memory of a live run; left out by debug runs. */
  resources?: MachineResources[]
  /** Tab to open on, for callers whose main view is not the script or logs. */
  defaultTab?: Tab
}

export function ExecutionDetails({
  isRunning,
  script,
  logs,
  checks,
  stats = null,
  resources = [],
  defaultTab,
}: ExecutionDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<Tab>(
    defaultTab ?? (script !== undefined ? 'script' : 'logs')
  )

  // A load test emits no stdout checks summary, so the CSV stream is the only
  // source there — see `checksFromStats`.
  const resolvedChecks = useMemo(
    () => (checks.length > 0 ? checks : checksFromStats(stats)),
    [checks, stats]
  )

  const consoleFilter = useConsoleFilter({
    browser: false,
  })

  const handleTabChange = (value: string) => {
    const tab = TABS.find((candidate) => candidate === value)

    if (tab === undefined) {
      return
    }

    setSelectedTab(tab)
  }

  useEffect(() => {
    return window.studio.script.onScriptFailed(() => {
      setSelectedTab('logs')
    })
  }, [])

  const handleCopy = useTrackScriptCopy(script, 'debugger')

  return (
    <Tabs.Root
      value={selectedTab}
      onValueChange={handleTabChange}
      css={css`
        height: 100%;
        display: flex;
        flex-direction: column;
      `}
    >
      <div css={toolbarStyles}>
        <Tabs.List size="2" css={tabPillStyles}>
          <Tabs.Trigger value="logs">Logs ({logs.length})</Tabs.Trigger>
          <Tabs.Trigger value="checks" disabled={resolvedChecks.length === 0}>
            Checks ({resolvedChecks.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="failed"
            disabled={!hasFailures(resolvedChecks, stats)}
          >
            Failed ({failureCount(stats)})
          </Tabs.Trigger>
          <Tabs.Trigger value="metrics">Metrics</Tabs.Trigger>
          {script !== undefined && (
            <Tabs.Trigger value="script">Script</Tabs.Trigger>
          )}
        </Tabs.List>

        <div css={aiButtonStyles}>
          <AiAnalysis
            request={{
              checks: resolvedChecks.filter((check) => check.fails > 0),
              errors: stats?.errors ?? [],
              requestStats: stats?.requestStats ?? [],
              logs,
              summary: runSummary(stats),
            }}
          />
        </div>
      </div>

      <Tabs.Content
        value="logs"
        css={css`
          flex: 1;
          min-height: 0;
        `}
      >
        <LogsSection {...consoleFilter} autoScroll={isRunning} logs={logs} />
      </Tabs.Content>
      {script !== undefined && (
        <Tabs.Content
          value="script"
          css={css`
            flex: 1;
          `}
        >
          <ReadOnlyEditor
            language="javascript"
            value={script}
            onCopy={handleCopy}
          />
        </Tabs.Content>
      )}
      <Tabs.Content
        value="checks"
        css={css`
          flex: 1;
          min-height: 0;
        `}
      >
        <ChecksSection checks={resolvedChecks} isRunning={isRunning} />
      </Tabs.Content>
      <Tabs.Content
        value="failed"
        css={css`
          flex: 1;
          min-height: 0;
        `}
      >
        <FailedSection checks={resolvedChecks} stats={stats} />
      </Tabs.Content>
      <Tabs.Content
        value="metrics"
        css={css`
          flex: 1;
          min-height: 0;
        `}
      >
        <MetricsSection stats={stats} resources={resources} />
      </Tabs.Content>
    </Tabs.Root>
  )
}
