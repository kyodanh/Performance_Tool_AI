import { DEFAULT_HTTP_TIMEOUT } from '@/schemas/generator'
import { ImmerStateCreator } from '@/utils/typescript'

interface State {
  httpTimeout: number
}

interface Actions {
  setHttpTimeout: (httpTimeout: number) => void
}

export type HttpTimeoutStore = State & Actions

export const createHttpTimeoutSlice: ImmerStateCreator<HttpTimeoutStore> = (
  set
) => ({
  httpTimeout: DEFAULT_HTTP_TIMEOUT,
  setHttpTimeout: (httpTimeout: number) =>
    set((state) => {
      state.httpTimeout = httpTimeout
    }),
})
