import { app, shell } from 'electron'

import { getPlatform } from './electron'

export function reportNewIssue() {
  const params = new URLSearchParams({
    template: 'bug.yaml',
    os: `${getPlatform()} ${process.getSystemVersion()}`,
    version: app.getVersion(),
  })

  return shell.openExternal(
    `https://github.com/kyodanh/Performance_Tool_AI/issues/new?${params.toString()}`
  )
}
