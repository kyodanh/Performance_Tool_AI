import { DEFAULT_WORKSPACE_SETTINGS } from '@/schemas/settings'
import { AppSettings } from '@/types/settings'
import { toNativePath, toPosixPath } from '@/utils/path'

function convertPaths(
  settings: AppSettings,
  convert: (p: string) => string
): AppSettings {
  return {
    ...settings,
    recorder:
      !settings.recorder.detectBrowserPath && settings.recorder.browserPath
        ? {
            ...settings.recorder,
            browserPath: convert(settings.recorder.browserPath),
          }
        : settings.recorder,
    proxy:
      settings.proxy.mode === 'upstream' && settings.proxy.certificatePath
        ? {
            ...settings.proxy,
            certificatePath: convert(settings.proxy.certificatePath),
          }
        : settings.proxy,
    // An empty root means "the default location" and must stay empty — only a
    // real path is rewritten. `workspace` is read defensively: in dev the
    // renderer hot-reloads while the main process still serves the previous
    // schema version, so the field can be missing from a settings object the
    // types say always has it.
    workspace: settings.workspace?.root
      ? { ...settings.workspace, root: convert(settings.workspace.root) }
      : (settings.workspace ?? DEFAULT_WORKSPACE_SETTINGS),
  }
}

export function settingsToFormValues(settings: AppSettings | undefined) {
  return settings ? convertPaths(settings, toNativePath) : settings
}

export function formValuesToSettings(data: AppSettings): AppSettings {
  return convertPaths(data, toPosixPath)
}
