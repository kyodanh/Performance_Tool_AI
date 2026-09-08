export enum SettingsHandler {
  Get = 'settings:get',
  Save = 'settings:save',
  SelectBrowserExecutable = 'settings:select-browser-executable',
  SelectUpstreamCertificate = 'settings:select-upstream-certificate',
  IsEncryptionAvailable = 'settings:is-encryption-available',
  GetWorkspaceInfo = 'settings:get-workspace-info',
}

export interface WorkspaceInfo {
  /** Where the workspace folders are being read from in this session. */
  activeRoot: string
  /** What an empty `workspace.root` resolves to on this machine. */
  defaultRoot: string
}
