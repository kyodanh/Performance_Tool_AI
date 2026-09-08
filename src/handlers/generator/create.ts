import { K6_GENERATOR_FILE_EXTENSION } from '@/constants/files'
import { getGeneratorsPath } from '@/constants/workspace'
import { getSettings } from '@/main/settings'
import { trackEvent } from '@/services/usageTracking'
import { UsageEventName } from '@/services/usageTracking/types'
import { createFileWithUniqueName } from '@/utils/fs'
import { createNewGeneratorFile } from '@/utils/generator'
import * as path from '@/utils/path'

import { serializeGenerator } from './serialization'

export async function createGenerator(recordingPath?: string): Promise<string> {
  const { script } = await getSettings()
  const generator = createNewGeneratorFile(recordingPath, script.httpTimeout)

  const filePath = await createFileWithUniqueName({
    data: serializeGenerator(
      path.join(getGeneratorsPath(), `Generator${K6_GENERATOR_FILE_EXTENSION}`),
      generator
    ),
    directory: getGeneratorsPath(),
    ext: K6_GENERATOR_FILE_EXTENSION,
    prefix: 'Generator',
  })

  trackEvent({ event: UsageEventName.GeneratorCreated })

  return filePath
}
