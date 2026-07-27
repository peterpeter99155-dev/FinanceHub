import type { FinanceHubApi } from '../shared/bootstrap';

declare global {
  interface Window {
    financeHub: FinanceHubApi;
  }
}

export {};
