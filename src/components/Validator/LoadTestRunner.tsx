import { css } from '@emotion/react'
import {
  Button,
  Callout,
  Card,
  Checkbox,
  Flex,
  Progress,
  ScrollArea,
  Text,
} from '@radix-ui/themes'
import {
  ChartColumnIcon,
  InfoIcon,
  PlayIcon,
  SquareIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { LoadGenerators } from '@/components/LoadGenerators'
import { LoadProfile } from '@/components/TestOptions/LoadProfile'
import TextSpinner from '@/components/TextSpinner/TextSpinner'
import { useRunChecks } from '@/hooks/useRunChecks'
import { useRunLogs } from '@/hooks/useRunLogs'
import { useRunStats } from '@/hooks/useRunStats'
import { routeMap } from '@/routeMap'
import { LoadProfileExecutorOptions } from '@/types/testOptions'
import {
  describeProfile,
  isRunnableProfile,
  peakVus,
  profileSeconds,
  toLoadProfile,
  toProfileOverrides,
} from '@/utils/k6/loadProfile'
import { K6TestOptions } from '@/utils/k6/schema'
import * as path from '@/utils/path'

import { ExecutionDetails } from './ExecutionDetails'
import { ExportReportButton } from './ExportReportButton'
import { formatDuration } from './format'
import { ScheduleBuilder } from './ScheduleBuilder'

interface LoadTestRunnerProps {
  scriptPath: string | null
  options: K6TestOptions
  /** Source to write before running, for scripts generated on the fly. */
  content?: string
  /** Profile to seed the form with, when the caller knows it (a generator). */
  profile?: LoadProfileExecutorOptions
}

/**
 * Load profile controls plus the live metrics for the run they start. Used both
 * as a dialog body from the validator and as the standalone Controller view.
 */
export function LoadTestRunner({
  scriptPath,
  options,
  content,
  profile: initialProfile,
}: LoadTestRunnerProps) {
  const [isRunning, setIsRunning] = useState(false)
  // Kept here rather than in the generator list because the run needs it, and
  // the list only needs to render it.
  const [useLocalGenerator, setUseLocalGenerator] = useState(true)
  const [verbose, setVerbose] = useState(false)
  const [httpDebug, setHttpDebug] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const navigate = useNavigate()

  // Stopping sends SIGTERM, and k6 reports that as an error log entry
  // ("aborted because k6 received a 'terminated' signal") on every generator.
  // A deliberate stop is not a failure, so drop errors once one is requested.
  const stoppingRef = useRef(false)

  // A script that declares `scenarios` was scheduled deliberately — possibly
  // several scenarios at once, which a single profile would collapse into one —
  // so leave it alone unless the user opts into overriding it.
  const declaresScenarios = Object.keys(options.scenarios ?? {}).length > 0
  const [override, setOverride] = useState(!declaresScenarios)

  const seed = useMemo(
    () => initialProfile ?? toLoadProfile(options),
    [initialProfile, options]
  )
  const [profile, setProfile] = useState(seed)

  // Reset when a different test is selected, so the form never shows the
  // previous test's schedule.
  useEffect(() => {
    setProfile(seed)
    setOverride(!declaresScenarios)
  }, [declaresScenarios, seed])

  // Guards the case where every stage was deleted by hand: without flags k6
  // would fall back to the script's own profile while this panel claims
  // otherwise.
  const canRun = isRunnableProfile(profile)

  // Iteration-based profiles finish when the work does, so there is no clock to
  // show progress against.
  const planned = profileSeconds(profile)

  const { stats, resetStats } = useRunStats()
  const { logs, resetLogs } = useRunLogs()
  const { checks, resetChecks } = useRunChecks()

  // A run can fail before it produces a single metric — archiving, a syntax
  // error, an invalid option — and k6 reports those as error log entries.
  useEffect(() => {
    return window.studio.script.onScriptLog((entry) => {
      if (stoppingRef.current || entry.level !== 'error') {
        return
      }

      setErrors((previous) => [...previous, entry.error ?? entry.msg])
    })
  }, [])

  useEffect(() => {
    return window.studio.script.onScriptStopped(() => {
      setIsRunning(false)
    })
  }, [])

  const handleStart = useCallback(async () => {
    if (scriptPath === null) {
      return
    }

    stoppingRef.current = false

    resetStats()
    resetLogs()
    resetChecks()
    setErrors([])
    setIsRunning(true)

    await window.studio.script
      .runLoadTest({
        path: scriptPath,
        content,
        verbose,
        httpDebug,
        useLocalGenerator,
        ...(override ? toProfileOverrides(profile) : {}),
      })
      .catch((error: Error) => {
        setIsRunning(false)
        setErrors((previous) => [...previous, error.message])
      })
  }, [
    content,
    override,
    profile,
    verbose,
    httpDebug,
    resetChecks,
    resetLogs,
    resetStats,
    scriptPath,
    useLocalGenerator,
  ])

  const handleStop = useCallback(() => {
    stoppingRef.current = true

    window.studio.script.stopScript()
    setIsRunning(false)
  }, [])

  return (
    <Flex
      direction="column"
      height="100%"
      minHeight="0"
      css={css`
        /* Only the results panel — the last child — takes the squeeze. Without
           this the generators table and the callouts shrink instead, and a Card
           clips its own rows mid-row once a run fills the column. */
        & > *:not(:last-child) {
          flex-shrink: 0;
        }
      `}
    >
      <LoadGenerators
        peakVus={peakVus(profile)}
        useLocal={useLocalGenerator}
        onUseLocalChange={setUseLocalGenerator}
        disabled={isRunning}
      />
      <Flex gap="3" align="center" mb="3">
        {isRunning ? (
          <Flex gap="3" align="center">
            <TextSpinner text="Running" />
            <Button color="red" radius="full" onClick={handleStop}>
              <SquareIcon /> Stop
            </Button>
          </Flex>
        ) : (
          <Button
            radius="full"
            onClick={handleStart}
            disabled={scriptPath === null || (override && !canRun)}
          >
            <PlayIcon /> Start
          </Button>
        )}
        {/* The run is saved to the Results folder when it ends, so Analysis
            opens it — including after the app has moved on. */}
        {!isRunning && stats !== null && stats.buckets.length > 0 && (
          <Button
            variant="soft"
            radius="full"
            onClick={() => navigate(routeMap.analysis)}
          >
            <ChartColumnIcon /> Analyse run
          </Button>
        )}
        <ExportReportButton
          stats={stats}
          testName={scriptPath === null ? 'k6' : path.name(scriptPath)}
          isRunning={isRunning}
        />
        <Text as="label" size="2" color="gray">
          <Flex gap="2" align="center">
            <Checkbox
              checked={verbose}
              disabled={isRunning}
              onCheckedChange={(checked) => setVerbose(checked === true)}
            />
            Verbose logs
          </Flex>
        </Text>
        <Text as="label" size="2" color="gray">
          <Flex gap="2" align="center">
            <Checkbox
              checked={httpDebug}
              disabled={isRunning}
              onCheckedChange={(checked) => setHttpDebug(checked === true)}
            />
            Log requests
          </Flex>
        </Text>
        {declaresScenarios && (
          <Text as="label" size="2">
            <Flex gap="2" align="center">
              <Checkbox
                checked={override}
                disabled={isRunning}
                onCheckedChange={(checked) => setOverride(checked === true)}
              />
              Override the test&apos;s own scenarios
            </Flex>
          </Text>
        )}
      </Flex>

      {errors.length > 0 && (
        <Callout.Root size="1" color="red" mb="3">
          <Callout.Icon>
            <TriangleAlertIcon />
          </Callout.Icon>
          <Callout.Text>
            <Flex direction="column" gap="1">
              {errors.slice(0, 3).map((message, index) => (
                <span key={index}>{message}</span>
              ))}
            </Flex>
          </Callout.Text>
        </Callout.Root>
      )}
      {!override && (
        <Callout.Root size="1" mb="3">
          <Callout.Icon>
            <InfoIcon />
          </Callout.Icon>
          <Callout.Text>
            The test declares its own <code>scenarios</code>, so that load
            profile is used as-is.
          </Callout.Text>
        </Callout.Root>
      )}

      {override && !canRun && (
        <Callout.Root size="1" color="amber" mb="3">
          <Callout.Icon>
            <InfoIcon />
          </Callout.Icon>
          <Callout.Text>
            The load profile schedules nothing — add a stage, or set VUs and
            iterations, before starting.
          </Callout.Text>
        </Callout.Root>
      )}

      <Flex flexGrow="1" minHeight="0" gap="3">
        {override && (
          <ScrollArea
            scrollbars="vertical"
            css={css`
              flex: 0 0 320px;
              border-right: 1px solid var(--gray-5);
              padding-right: var(--space-3);
            `}
          >
            <ScheduleBuilder
              key={scriptPath ?? ''}
              vus={peakVus(seed)}
              onChange={setProfile}
              disabled={isRunning}
            />
            <Card size="2" mt="3">
              <details
                css={css`
                  summary {
                    cursor: pointer;
                    font-size: var(--font-size-1);
                    color: var(--gray-11);
                  }
                `}
              >
                <summary>About the load profile</summary>
                <Text as="p" size="1" color="gray" mt="2">
                  A gradual start becomes a linear ramp of the same length — k6
                  interpolates between stages instead of stepping. Running until
                  completion runs one iteration per VU.
                </Text>
              </details>
              <Text as="p" size="1" color="gray" mt="2">
                k6 runs: {describeProfile(profile)}
              </Text>
            </Card>
            <details
              css={css`
                margin-top: var(--space-3);
                border-top: 1px solid var(--gray-5);
                padding-top: var(--space-3);

                summary {
                  cursor: pointer;
                  font-size: var(--font-size-1);
                  color: var(--gray-11);
                }
              `}
            >
              <summary>Edit the k6 load profile</summary>
              <fieldset
                disabled={isRunning}
                css={css`
                  border: 0;
                  margin: var(--space-2) 0 0;
                  padding: 0;
                  min-width: 0;
                `}
              >
                <LoadProfile
                  value={profile}
                  onChange={setProfile}
                  executors={['ramping-vus', 'shared-iterations']}
                />
              </fieldset>
            </details>
            <Card size="2" mt="3">
              <Flex direction="column" gap="2">
                <Flex justify="between" align="baseline" gap="2">
                  <Text
                    size="1"
                    color="gray"
                    weight="medium"
                    css={css`
                      text-transform: uppercase;
                      letter-spacing: 0.08em;
                    `}
                  >
                    Current run
                  </Text>
                  <Text size="3" weight="bold">
                    {formatDuration(stats?.elapsed ?? 0)}
                  </Text>
                </Flex>
                {planned !== null && (
                  <Progress
                    value={Math.min(
                      100,
                      ((stats?.elapsed ?? 0) / planned) * 100
                    )}
                  />
                )}
              </Flex>
            </Card>
          </ScrollArea>
        )}
        <Flex direction="column" flexGrow="1" minHeight="0" minWidth="0">
          <ExecutionDetails
            isRunning={isRunning}
            logs={logs}
            checks={checks}
            stats={stats}
            defaultTab="metrics"
          />
        </Flex>
      </Flex>
    </Flex>
  )
}
