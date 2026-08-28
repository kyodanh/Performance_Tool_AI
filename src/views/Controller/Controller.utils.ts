import { selectFilteredRequests } from '@/store/generator'
import {
  generateScriptPreview,
  loadGeneratorFile,
  loadHarFile,
} from '@/views/Generator/Generator.utils'

/**
 * Renders a generator into a runnable k6 script without going through the
 * generator store, so the controller can run any generator in the workspace
 * rather than only the one currently open in the editor.
 */
export async function loadGeneratorTest(generatorPath: string) {
  const { data: generator } = await loadGeneratorFile(generatorPath)

  // A generator built purely from manual requests has no recording attached.
  const recording = generator.recordingPath
    ? await loadHarFile(generator.recordingPath)
    : []

  const requests = selectFilteredRequests({
    requests: recording,
    manualRequests: generator.manualRequests ?? [],
    excludedRequests: generator.excludedRequests ?? [],
    requestOverrides: generator.requestOverrides ?? {},
    groupRenames: generator.groupRenames ?? {},
    allowlist: generator.allowlist,
    includeStaticAssets: generator.includeStaticAssets,
  })

  const path = await window.studio.fs.getTempScriptPath()
  const content = await generateScriptPreview(path, generator, requests)

  return { path, content, loadProfile: generator.options.loadProfile }
}
