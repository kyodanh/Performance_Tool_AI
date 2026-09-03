import { css } from '@emotion/react'
import { Badge, Flex, IconButton, ScrollArea, Text } from '@radix-ui/themes'
import { useQuery } from '@tanstack/react-query'
import { ChartColumnIcon, Trash2Icon } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useDeleteResults } from '@/hooks/useDeleteResults'
import { getAnalysisPath, routeMap } from '@/routeMap'
import { groupRuns } from '@/views/Analysis/Analysis.utils'

import { SidebarEmptyState } from './SidebarEmptyState'
import { SidebarHeader } from './SidebarHeader'

interface AnalysisTabProps {
  onCollapseSidebar: () => void
}

/**
 * The tests that have saved runs — clicking one opens that test's results,
 * rather than the Controller's runnable-test list which starts a new run.
 */
export function AnalysisTab({ onCollapseSidebar }: AnalysisTabProps) {
  const { project } = useParams<{ project: string }>()
  const navigate = useNavigate()
  const deleteResults = useDeleteResults()

  const { data: results = [] } = useQuery({
    queryKey: ['run-results'],
    queryFn: () => window.studio.ui.listResults(),
  })

  const projects = useMemo(() => groupRuns(results), [results])
  // No project in the URL means the view opened on the newest one.
  const active = project ?? projects[0]?.testName

  return (
    <>
      <SidebarHeader
        icon={<ChartColumnIcon />}
        title="Analysis"
        onCollapseSidebar={onCollapseSidebar}
      />
      {projects.length === 0 ? (
        <SidebarEmptyState
          message="Tests you have saved a run for will appear here."
          action={null}
        />
      ) : (
        <ScrollArea scrollbars="vertical">
          <Flex direction="column" py="2">
            {projects.map(({ testName, runs }) => (
              <Flex
                key={testName}
                align="center"
                gap="2"
                px="3"
                py="2"
                css={css`
                  background-color: ${testName === active
                    ? 'var(--accent-3)'
                    : 'transparent'};

                  &:hover {
                    background-color: var(--gray-3);
                  }
                `}
              >
                <Flex
                  asChild
                  align="center"
                  gap="2"
                  flexGrow="1"
                  minWidth="0"
                  css={css`
                    color: inherit;
                    text-decoration: none;
                  `}
                >
                  <Link to={getAnalysisPath(testName)}>
                    <Text size="2" truncate>
                      {testName}
                    </Text>
                    <Badge ml="auto" variant="soft" radius="full">
                      {runs.length}
                    </Badge>
                  </Link>
                </Flex>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label={`Delete the saved runs of ${testName}`}
                  onClick={() => {
                    void deleteResults(
                      runs.map((run) => run.id),
                      `${testName} — ${runs.length} version(s)`
                    )

                    // The list this was opened from is gone with it.
                    if (testName === active) {
                      navigate(routeMap.analysis)
                    }
                  }}
                >
                  <Trash2Icon />
                </IconButton>
              </Flex>
            ))}
          </Flex>
        </ScrollArea>
      )}
    </>
  )
}
