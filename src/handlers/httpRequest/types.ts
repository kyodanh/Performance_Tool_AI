import { Header, Method, Response } from '@/types'

export enum HttpRequestHandler {
  Send = 'http-request:send',
}

export interface SendHttpRequestOptions {
  method: Method
  url: string
  headers: Header[]
  content: string | null
}

export type SendHttpRequestResult =
  | { type: 'success'; response: Response }
  | { type: 'error'; message: string }
