import { z } from 'zod'

import { DEFAULT_HTTP_TIMEOUT } from '../../generator/v3/testOptions'
// Imported from v4, not v5: each version may only depend on versions older
// than itself. v5 imports v6 to declare its migration, so a v6 -> v5 import
// would be a cycle and leave these schemas undefined at module-eval time.
import {
  AppearanceSchema,
  ProxySettingsSchema,
  RecorderSettingsSchema,
  TelemetrySchema,
  WindowStateSchema,
  type UpstreamProxySettings,
} from '../v4'

export {
  AppearanceSchema,
  ProxySettingsSchema,
  RecorderSettingsSchema,
  TelemetrySchema,
  WindowStateSchema,
  type UpstreamProxySettings,
}

/**
 * Defaults applied to newly created generators. Each `.k6g` keeps its own copy
 * of these values, so changing them here never rewrites an existing test.
 */
export const ScriptSettingsSchema = z.object({
  httpTimeout: z.number().positive().default(DEFAULT_HTTP_TIMEOUT),
  // Unlocks the editable fields in the JMeter / LoadRunner export tree. Edits
  // go into the generator, so every tab regenerates — the raw XML / C source
  // stays read-only, there is nothing to parse it back from.
  allowExportEdit: z.boolean().default(false),
})

export const DEFAULT_SCRIPT_SETTINGS = {
  httpTimeout: DEFAULT_HTTP_TIMEOUT,
  allowExportEdit: false,
}

/**
 * Where the Recordings / Generators / Scripts / Data / Browser / Results
 * folders live. An empty string means the default location
 * (`Documents/k6-studio`) — storing it that way keeps the settings file valid
 * when the OS reports a different Documents folder, and lets the UI tell
 * "never chosen" apart from "deliberately pointed at the default".
 */
export const WorkspaceSettingsSchema = z.object({
  root: z.string().default(''),
})

export const DEFAULT_WORKSPACE_SETTINGS = {
  root: '',
}

export const AppSettingsSchema = z.object({
  version: z.literal('6.0'),
  proxy: ProxySettingsSchema,
  recorder: RecorderSettingsSchema,
  windowState: WindowStateSchema,
  telemetry: TelemetrySchema,
  appearance: AppearanceSchema,
  script: ScriptSettingsSchema.default(DEFAULT_SCRIPT_SETTINGS),
  workspace: WorkspaceSettingsSchema.default(DEFAULT_WORKSPACE_SETTINGS),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>
