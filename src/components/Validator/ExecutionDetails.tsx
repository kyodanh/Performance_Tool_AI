import { css } from '@emotion/react'
import { Tabs } from '@radix-ui/themes'
import { useEffect, useState } from 'react'

import { useTrackScriptCopy } from '@/hooks/useTrackScriptCopy'
import { Check, LogEntry } from '@/schemas/k6'
import { RunStats } from '@/utils/k6/stats'

import { ReadOnlyEditor } from '../Monaco/ReadOnlyEditor'

import { ChecksSection } from './ChecksSection'
import { FailedSection, hasFailures } from './FailedSection'
import { LogsSection, useConsoleFilter } from './LogsSection'
import { MetricsSection } from './MetricsSection'

type Tab = 'logs' | 'checks' | 'failed' | 'metrics' | 'script'

const TABS: Tab[] = ['logs', 'checks', 'failed', 'metrics', 'script']

interface ExecutionDetailsProps {
  isRunning: boolean
  script?: string
  logs: LogEntry[]
  checks: Check[]
  stats?: RunStats | null
  /** Tab to open on, for callers whose main view is not the script or logs. */
  defaultTab?: Tab
}

export function ExecutionDetails({
  isRunning,
  script,
  logs,
  checks,
  stats = null,
  defaultTab,
}: ExecutionDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<Tab>(
    defaultTab ?? (script !== undefined ? 'script' : 'logs')
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
      <Tabs.List
        css={css`
          flex-shrink: 0;
          align-self: flex-start;
          margin-bottom: var(--space-3);
          padding: var(--space-1);
          border-radius: var(--radius-6);
          background-color: var(--gray-3);
          box-shadow: none;
          --tab-inner-border-radius: var(--radius-6);

          /* a pill has no underline indicator */
          & > button::before {
            display: none;
          }

          & > button[data-state='active'] {
            color: var(--accent-contrast);
          }

          & > button[data-state='active'] .rt-BaseTabListTriggerInner {
            background-color: var(--accent-9);
          }
        `}
      >
        <Tabs.Trigger value="logs">Logs ({logs.length})</Tabs.Trigger>
        <Tabs.Trigger value="checks" disabled={checks.length === 0}>
          Checks ({checks.length})
        </Tabs.Trigger>
        <Tabs.Trigger value="failed" disabled={!hasFailures(checks, stats)}>
          Failed
        </Tabs.Trigger>
        <Tabs.Trigger value="metrics">Metrics</Tabs.Trigger>
        {script !== undefined && (
          <Tabs.Trigger value="script">Script</Tabs.Trigger>
        )}
      </Tabs.List>

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
        <ChecksSection checks={checks} isRunning={isRunning} />
      </Tabs.Content>
      <Tabs.Content
        value="failed"
        css={css`
          flex: 1;
          min-height: 0;
        `}
      >
        <FailedSection checks={checks} stats={stats} logs={logs} />
      </Tabs.Content>
      <Tabs.Content
        value="metrics"
        css={css`
          flex: 1;
          min-height: 0;
        `}
      >
        <MetricsSection stats={stats} />
      </Tabs.Content>
    </Tabs.Root>
  )
}
