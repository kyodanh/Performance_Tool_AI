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
import { useQuery } from '@tanstack/react-query'
import { InfoIcon, PlayIcon, SquareIcon, TriangleAlertIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { LoadGenerators } from '@/components/LoadGenerators'
import { LoadProfile } from '@/components/TestOptions/LoadProfile'
import TextSpinner from '@/components/TextSpinner/TextSpinner'
import { useLoadRunStore } from '@/store/loadRun'
import { MachineSample } from '@/types/systemMetrics'
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
import { SaveRunButton } from './SaveRunButton'
import { ScheduleBuilder } from './ScheduleBuilder'

interface LoadTestRunnerProps {
  scriptPath: string | null
  options: K6TestOptions
  /** Source to write before running, for scripts generated on the fly. */
  content?: string
  /**
   * What to call the run in the saved result and the report. `scriptPath` is a
   * random temp file for a generator, so it makes a useless label.
   */
  name?: string
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
  name,
  profile: initialProfile,
}: LoadTestRunnerProps) {
  // The run itself lives in the main process, so its state lives in a store
  // that outlives this panel — see `@/store/loadRun`.
  const isRunning = useLoadRunStore((state) => state.isRunning)
  const stats = useLoadRunStore((state) => state.stats)
  const logs = useLoadRunStore((state) => state.logs)
  const checks = useLoadRunStore((state) => state.checks)
  const errors = useLoadRunStore((state) => state.errors)
  const startRun = useLoadRunStore((state) => state.startRun)
  const stopRun = useLoadRunStore((state) => state.stopRun)
  const failRun = useLoadRunStore((state) => state.failRun)
  const resources = useLoadRunStore((state) => state.resources)
  const sampleResources = useLoadRunStore((state) => state.sampleResources)

  // Sampled here rather than inside the metrics panel so switching tabs does
  // not interrupt the run's CPU peak. Stops with the run: the last sample and
  // the peaks stay on screen once it is over.
  const { data: local } = useQuery({
    queryKey: ['system-metrics'],
    enabled: isRunning,
    refetchInterval: 2000,
    queryFn: () => window.studio.app.getSystemMetrics(),
  })

  // Remote machines report theirs on their heartbeat, so this only reads the
  // pool — the same query the generators table above already keeps warm.
  const { data: generators = [] } = useQuery({
    queryKey: ['load-generators'],
    queryFn: () => window.studio.loadGenerator.getLoadGenerators(),
  })

  useEffect(() => {
    if (!isRunning) {
      return
    }

    const samples: MachineSample[] = [
      ...(local === undefined
        ? []
        : [{ id: 'local', name: 'This machine', ...local }]),
      ...generators.flatMap((generator) =>
        generator.resources === undefined
          ? []
          : [
              {
                id: generator.id,
                name: generator.hostname,
                ...generator.resources,
              },
            ]
      ),
    ]

    if (samples.length > 0) {
      sampleResources(samples)
    }
  }, [generators, isRunning, local, sampleResources])

  // Kept here rather than in the generator list because the run needs it, and
  // the list only needs to render it.
  const [useLocalGenerator, setUseLocalGenerator] = useState(true)
  const [verbose, setVerbose] = useState(false)
  const [httpDebug, setHttpDebug] = useState(false)

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

  const testName = name ?? (scriptPath === null ? 'k6' : path.name(scriptPath))

  const handleStart = useCallback(async () => {
    if (scriptPath === null) {
      return
    }

    startRun()

    await window.studio.script
      .runLoadTest({
        path: scriptPath,
        content,
        name: testName,
        verbose,
        httpDebug,
        useLocalGenerator,
        ...(override ? toProfileOverrides(profile) : {}),
      })
      .catch((error: Error) => {
        failRun(error.message)
      })
  }, [
    content,
    override,
    profile,
    verbose,
    httpDebug,
    failRun,
    startRun,
    scriptPath,
    testName,
    useLocalGenerator,
  ])

  const handleStop = useCallback(() => {
    window.studio.script.stopScript()
    stopRun()
  }, [stopRun])

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
        {!isRunning && stats !== null && stats.buckets.length > 0 && (
          <SaveRunButton testName={testName} stats={stats} />
        )}
        <ExportReportButton
          stats={stats}
          testName={testName}
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
            resources={resources}
            defaultTab="metrics"
          />
        </Flex>
      </Flex>
    </Flex>
  )
}
