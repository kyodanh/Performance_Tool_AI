import { useCallback, useEffect, useState } from 'react'

import { RunStats } from '@/utils/k6/stats'

export function useRunStats() {
  const [stats, setStats] = useState<RunStats | null>(null)

  const resetStats = useCallback(() => {
    setStats(null)
  }, [])

  useEffect(() => {
    return window.studio.script.onScriptStats(setStats)
  }, [])

  return { stats, resetStats }
}
