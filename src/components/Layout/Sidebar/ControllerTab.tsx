import { GaugeIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getControllerPath } from '@/routeMap'

import { useFiles } from './Sidebar.hooks'
import { SidebarFileList } from './SidebarFileList'
import { SidebarHeader } from './SidebarHeader'

interface ControllerTabProps {
  onCollapseSidebar: () => void
}

export function ControllerTab({ onCollapseSidebar }: ControllerTabProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const { tests, scripts } = useFiles(searchTerm)

  // Browser tests need the browser entrypoint, which the load runner skips.
  const runnable = useMemo(
    () =>
      [...tests.filter((file) => file.type === 'generator'), ...scripts].sort(
        (a, b) => a.displayName.localeCompare(b.displayName)
      ),
    [scripts, tests]
  )

  return (
    <>
      <SidebarHeader
        icon={<GaugeIcon />}
        title="Load tests"
        onCollapseSidebar={onCollapseSidebar}
      />
      <SidebarFileList
        isEmpty={runnable.length === 0 && searchTerm.trim() === ''}
        files={runnable}
        searchTerm={searchTerm}
        placeholder="Search tests..."
        noFilesMessage="No tests found"
        emptyMessage="Tests and exported scripts you can run under load will appear here."
        emptyAction={null}
        getPath={getControllerPath}
        onSearchChange={setSearchTerm}
      />
    </>
  )
}
