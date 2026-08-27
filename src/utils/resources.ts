import { app } from 'electron'

import { readFile } from './fs'
import * as path from './path'

const RESOURCE_INDEX = {
  'browser-script': 'browser/index.js',
  'replay-script': 'replay.js',
  'entrypoint-script': 'entrypoint.js',
  'k6-testing-shim': 'k6-testing.js',
  'load-generator-joiner-sh': 'loadGenerator/join.sh',
  'load-generator-joiner-ps1': 'loadGenerator/join.ps1',
}

export type ResourceName = keyof typeof RESOURCE_INDEX

function getResourceRootPath() {
  return !import.meta.env.PROD
    ? path.join(app.getAppPath(), 'resources')
    : process.resourcesPath
}

export function getResourcePath(resource: ResourceName): string {
  return path.join(getResourceRootPath(), RESOURCE_INDEX[resource])
}

export function readResource(resource: ResourceName) {
  return readFile(getResourcePath(resource), { encoding: 'utf-8' })
}
