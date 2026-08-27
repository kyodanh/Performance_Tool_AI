import { ipcRenderer } from 'electron'

import { LoadGenerator } from '@/types/loadGenerator'

import { createListener } from '../utils'

import { EnrollmentDetails, LoadGeneratorHandler } from './types'

export function enroll() {
  return ipcRenderer.invoke(
    LoadGeneratorHandler.Enroll
  ) as Promise<EnrollmentDetails>
}

export function getLoadGenerators() {
  return ipcRenderer.invoke(LoadGeneratorHandler.List) as Promise<
    LoadGenerator[]
  >
}

export function disconnectLoadGenerator(id: string) {
  ipcRenderer.send(LoadGeneratorHandler.Disconnect, id)
}

export function setLoadGeneratorWeight(id: string, weight: number) {
  ipcRenderer.send(LoadGeneratorHandler.SetWeight, id, weight)
}

export function onLoadGeneratorsChanged(
  callback: (generators: LoadGenerator[]) => void
) {
  return createListener(LoadGeneratorHandler.Changed, callback)
}
