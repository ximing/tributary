import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { observer, useService } from '@rabjs/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { setUnauthorizedHandler } from './api/client.js';
import { AuthPage } from './AuthPage.js';
import { registerAppServices } from './services/register-app.js';
import { SessionService } from './services/session.service.js';
import { readMapId } from './lib/mapMemory.js';
import { Workspace } from './workspace/Workspace.js';
import './styles/index.css';

declare global {
  interface Window {
    __tributaryErrors: string[];
  }
}

window.__tributaryErrors = [];
window.addEventListener('error', (event) => {
  // 浏览器在一帧里收不完 ResizeObserver 通知时会抛这条，不是应用异常。
  if (event.message.startsWith('ResizeObserver loop')) return;
  window.__tributaryErrors.push(event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason;
  window.__tributaryErrors.push(reason instanceof Error ? reason.message : String(reason));
});

registerAppServices();

const Gate = observer(function Gate() {
  const session = useService(SessionService);

  useEffect(() => {
    setUnauthorizedHandler(() => session.clear());
    void session.load();
  }, [session]);

  if (!session.ready) return <main className="auth-screen" />;
  if (!session.user) return <AuthPage />;
  return (
    <Routes>
      <Route element={<Workspace />}>
        <Route index element={null} />
        <Route path="mind" element={null} />
        <Route path="settings" element={<LegacySettings section="models" />} />
        <Route path="usage" element={<LegacySettings section="usage" />} />
      </Route>
    </Routes>
  );
});

function LegacySettings({ section }: { section: 'models' | 'usage' }) {
  const stored = readMapId();
  const to = stored ? `/mind?id=${encodeURIComponent(stored)}&settings=${section}` : `/?settings=${section}`;
  return <Navigate to={to} replace />;
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
