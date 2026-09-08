import { Callout, Code, Flex, Text } from '@radix-ui/themes'
import { useQuery } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'

import { toNativePath } from '@/utils/path'

import { SettingsSection } from './SettingsSection'

function useWorkspaceInfo() {
  return useQuery({
    queryKey: ['settings', 'workspaceInfo'],
    queryFn: window.studio.settings.getWorkspaceInfo,
  })
}

/**
 * Read-only on purpose: a project is switched from the File menu, which creates
 * the folders and restarts, rather than by typing a path here and hoping it
 * exists.
 */
export const WorkspaceSettings = () => {
  const { data: info } = useWorkspaceInfo()

  return (
    <SettingsSection>
      <Text size="2" color="gray" mb="2" as="p">
        Current project
      </Text>

      <Text size="2" as="p" mb="5">
        <Code variant="soft">{info ? toNativePath(info.activeRoot) : '—'}</Code>
      </Text>

      <Text size="2" color="gray" mb="4" as="p">
        It holds one <Code>Recordings</Code>, <Code>Generators</Code>,{' '}
        <Code>Scripts</Code>, <Code>Data</Code>, <Code>Browser</Code> and{' '}
        <Code>Results</Code> folder. Everything you record, generate and export
        stays inside it.
      </Text>

      <Callout.Root color="blue">
        <Callout.Icon>
          <InfoIcon />
        </Callout.Icon>

        <Callout.Text>
          <Flex direction="column" gap="1" align="start">
            <Text>
              Use <Code>File ▸ New ▸ Project…</Code> to start a project in its
              own folder, or <Code>File ▸ Open Project…</Code> to switch to one.
            </Text>
            <Text>
              k6 Studio restarts when you switch — the file list, the open tabs
              and the recorder all follow the project.
            </Text>
          </Flex>
        </Callout.Text>
      </Callout.Root>
    </SettingsSection>
  )
}
