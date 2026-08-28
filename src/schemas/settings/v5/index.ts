import { z } from 'zod'

import { DEFAULT_HTTP_TIMEOUT } from '../../generator/v3/testOptions'
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

export const AppSettingsSchema = z.object({
  version: z.literal('5.0'),
  proxy: ProxySettingsSchema,
  recorder: RecorderSettingsSchema,
  windowState: WindowStateSchema,
  telemetry: TelemetrySchema,
  appearance: AppearanceSchema,
  script: ScriptSettingsSchema.default(DEFAULT_SCRIPT_SETTINGS),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>
