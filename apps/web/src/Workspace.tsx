import { useCallback, useEffect } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { useHotkeys } from './hooks/useHotkeys.js';
import { useWorkspace } from './store/workspace.js';
import { initStreamManager } from './streams/streamManager.js';
import { Canvas } from './components/canvas/Canvas.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { ContextMenu } from './components/ContextMenu.js';
import { HelpPanel } from './components/HelpPanel.js';
import { Rail } from './components/rail/Rail.js';
import { SettingsDialog, SETTINGS_SECTIONS } from './Settings.js';

export function Workspace() {
  const init = useWorkspace((state) => state.init);
  const notice = useWorkspace((state) => state.notice);
  const setNotice = useWorkspace((state) => state.setNotice);
  const [params, setParams] = useSearchParams();
  const settings = params.get('settings');
  const settingsSection = SETTINGS_SECTIONS.find((section) => section === settings) ?? null;

  useEffect(() => {
    void init();
    return initStreamManager();
  }, [init]);

  useHotkeys({
    openSettings: useCallback(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set('settings', 'account');
        return next;
      });
    }, [setParams]),
  });

  return (
    <div className="app">
      <Rail />
      <main className="stage">
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </main>
      <ContextMenu />
      <HelpPanel />
      <ConfirmDialog />
      {settingsSection ? (
        <SettingsDialog
          section={settingsSection}
          onSection={(section) => {
            setParams(
              (current) => {
                const next = new URLSearchParams(current);
                next.set('settings', section);
                return next;
              },
              { replace: true },
            );
          }}
          onClose={() => {
            setParams(
              (current) => {
                const next = new URLSearchParams(current);
                next.delete('settings');
                return next;
              },
              { replace: true },
            );
          }}
        />
      ) : null}
      <Outlet />
      {notice ? (
        <button type="button" className="notice" onClick={() => setNotice('')}>
          {notice}
        </button>
      ) : null}
    </div>
  );
}
