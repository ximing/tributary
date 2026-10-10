import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { setUnauthorizedHandler } from './api/client.js';
import { AuthPage } from './AuthPage.js';
import { useSession } from './store/session.js';
import { Workspace } from './Workspace.js';
import './lib/theme.js';
import './styles/index.css';

declare global {
  interface Window {
    __tributaryErrors: string[];
  }
}

window.__tributaryErrors = [];
window.addEventListener('error', (event) => {
  window.__tributaryErrors.push(event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason;
  window.__tributaryErrors.push(reason instanceof Error ? reason.message : String(reason));
});

function Gate() {
  const ready = useSession((state) => state.ready);
  const user = useSession((state) => state.user);
  const load = useSession((state) => state.load);
  const clear = useSession((state) => state.clear);

  useEffect(() => {
    setUnauthorizedHandler(() => clear());
    void load();
  }, [clear, load]);

  if (!ready) return <main className="auth-screen" />;
  if (!user) return <AuthPage />;
  return (
    <Routes>
      <Route element={<Workspace />}>
        <Route index element={null} />
        <Route path="settings" element={<Navigate to="/?settings=models" replace />} />
        <Route path="usage" element={<Navigate to="/?settings=usage" replace />} />
      </Route>
    </Routes>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('缺少根节点');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Gate />
    </BrowserRouter>
  </StrictMode>,
);
