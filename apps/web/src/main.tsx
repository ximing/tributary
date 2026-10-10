import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { UsagePage } from './Usage.js';
import { Workspace } from './Workspace.js';
import './styles.css';

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

const root = document.getElementById('root');
if (!root) throw new Error('缺少根节点');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Workspace />} />
        <Route path="/usage" element={<UsagePage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
