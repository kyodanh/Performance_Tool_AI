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
})

export const AppSettingsSchema = z.object({
  version: z.literal('5.0'),
  proxy: ProxySettingsSchema,
  recorder: RecorderSettingsSchema,
  windowState: WindowStateSchema,
  telemetry: TelemetrySchema,
  appearance: AppearanceSchema,
  script: ScriptSettingsSchema.default({ httpTimeout: DEFAULT_HTTP_TIMEOUT }),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>
