export const IPC_CHANNELS = {
  getBootstrapStatus: 'app:get-bootstrap-status',
} as const;

export interface BootstrapStatus {
  appName: string;
  databaseReady: boolean;
  storagePolicy: 'sample-data-only';
}

export interface FinanceHubApi {
  getBootstrapStatus(): Promise<BootstrapStatus>;
}
