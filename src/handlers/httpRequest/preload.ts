import { ipcRenderer } from 'electron'

import {
  HttpRequestHandler,
  SendHttpRequestOptions,
  SendHttpRequestResult,
} from './types'

export function send(options: SendHttpRequestOptions) {
  return ipcRenderer.invoke(
    HttpRequestHandler.Send,
    options
  ) as Promise<SendHttpRequestResult>
}
