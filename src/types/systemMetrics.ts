/** Machine-wide CPU and memory of the controller host. */
export interface SystemMetrics {
  /** Busy share of all cores over the sampling window, 0-100. */
  cpuPercent: number
  cpuCount: number
  memUsedBytes: number
  memTotalBytes: number
}

/** One machine's latest sample plus the worst seen while the run was watched. */
export interface MachineResources extends SystemMetrics {
  /** `local` for the controller machine, otherwise the generator's id. */
  id: string
  name: string
  peakCpuPercent: number
  peakMemUsedBytes: number
}

/** A machine's latest sample, before the peaks of the run are folded in. */
export type MachineSample = SystemMetrics & { id: string; name: string }
