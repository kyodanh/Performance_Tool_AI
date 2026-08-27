export enum LoadGeneratorHandler {
  Enroll = 'load-generator:enroll',
  List = 'load-generator:list',
  Disconnect = 'load-generator:disconnect',
  SetWeight = 'load-generator:set-weight',
  Changed = 'load-generator:changed',
}

export interface EnrollmentDetails {
  /** Controller base URL the joiner calls back on. */
  url: string
  /** Short code that authorises a join. */
  key: string
  /** Ready-to-paste command for macOS and Linux. */
  posixCommand: string
  /** Ready-to-paste command for Windows, runnable from CMD. */
  windowsCommand: string
  /** Unix milliseconds after which the code stops being accepted. */
  expiresAt: number
}
