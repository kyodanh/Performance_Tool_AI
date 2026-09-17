import { useSyncedLocalStorage } from '@/hooks/useSyncedLocalStorage'
import { DEFAULT_SLA, SlaSchema } from '@/utils/k6/sla'

/**
 * The service level is a contract agreed once, not a per-run setting, so it is
 * remembered across restarts and shared by every view that judges a run.
 */
export function useSla() {
  return useSyncedLocalStorage('k6-studio-sla', SlaSchema, DEFAULT_SLA)
}
