import { Callout, Flex } from '@radix-ui/themes'
import { useQuery } from '@tanstack/react-query'
import { InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { View } from '@/components/Layout/View'
import { LoadTestRunner } from '@/components/Validator/LoadTestRunner'
import { useStudioUIStore } from '@/store/ui/useStudioUIStore'
import { LoadProfileExecutorOptions } from '@/types/testOptions'
import { K6TestOptions } from '@/utils/k6/schema'
import * as path from '@/utils/path'

import { loadGeneratorTest } from './Controller.utils'

interface ControllerTest {
  path: string
  content?: string
  options: K6TestOptions
  /** The generator's own load profile, used to seed the schedule form. */
  profile?: LoadProfileExecutorOptions
}

export function Controller() {
  const { filePath } = useParams<{ filePath: string }>()

  const file = useStudioUIStore((state) => {
    if (filePath === undefined) {
      return undefined
    }

    const key = path.key(filePath)

    return state.generators.get(key) ?? state.scripts.get(key)
  })

  // A generator has no script on disk, so its k6 script is rendered here and
  // handed to the run as source. A `.js` test is read straight from disk.
  const { data: test, error } = useQuery({
    queryKey: ['controller-test', file],
    enabled: file !== undefined,
    queryFn: async (): Promise<ControllerTest> => {
      if (file === undefined) {
        throw new Error('No test selected')
      }

      if (file.type === 'generator') {
        const {
          path: scriptPath,
          content,
          loadProfile,
        } = await loadGeneratorTest(file.path)

        return {
          path: scriptPath,
          content,
          options: {},
          profile: loadProfile,
        }
      }

      return {
        path: file.path,
        options: await window.studio.script.analyzeScript(file.path),
      }
    },
  })

  return (
    <View title="Controller" subTitle={file?.displayName} actions={null}>
      <Flex direction="column" p="3" height="100%" minHeight="0" width="100%">
        {file === undefined && (
          <Callout.Root size="1">
            <Callout.Icon>
              <InfoIcon />
            </Callout.Icon>
            <Callout.Text>
              Select a test in the sidebar to run it under load.
            </Callout.Text>
          </Callout.Root>
        )}
        {error && (
          <Callout.Root size="1" color="red" mb="3">
            <Callout.Icon>
              <TriangleAlertIcon />
            </Callout.Icon>
            <Callout.Text>
              Could not prepare the test: {error.message}
            </Callout.Text>
          </Callout.Root>
        )}
        {file !== undefined && (
          <LoadTestRunner
            key={file.path}
            scriptPath={test?.path ?? null}
            content={test?.content}
            name={file.displayName}
            options={test?.options ?? {}}
            profile={test?.profile}
          />
        )}
      </Flex>
    </View>
  )
}
