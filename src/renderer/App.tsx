import { useEffect, useState } from 'react';

import type { BootstrapStatus } from '../shared/bootstrap';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: BootstrapStatus }
  | { status: 'error'; message: string };

export function App() {
  const [loadState, setLoadState] = useState<LoadState>({
    status: 'loading',
  });

  useEffect(() => {
    void window.financeHub
      .getBootstrapStatus()
      .then((data) => setLoadState({ status: 'ready', data }))
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : '無法載入應用程式狀態';
        setLoadState({ status: 'error', message });
      });
  }, []);

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">LOCAL-FIRST FINANCE</p>
        <h1>FinanceHub</h1>
        <p className="subtitle">以淨資產為核心的個人財務中控台</p>
      </header>

      <section className="status-card" aria-live="polite">
        <div>
          <p className="label">Sprint 01</p>
          <h2>技術底座</h2>
          <p>
            Electron、React、TypeScript 與本機資料層已連接。下一步將加入資產與負債模型。
          </p>
        </div>

        {loadState.status === 'loading' && (
          <span className="badge pending">正在檢查…</span>
        )}
        {loadState.status === 'ready' && (
          <span
            className={`badge ${
              loadState.data.databaseReady ? 'ready' : 'error'
            }`}
          >
            {loadState.data.databaseReady ? '本機資料層就緒' : '資料層未就緒'}
          </span>
        )}
        {loadState.status === 'error' && (
          <span className="badge error">{loadState.message}</span>
        )}
      </section>

      <aside className="warning">
        <strong>開發資料限制</strong>
        <span>正式加密完成前，只能使用假資料或匿名化資料。</span>
      </aside>
    </main>
  );
}
