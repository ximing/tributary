import { useCallback, useEffect } from 'react';
import { bindServices, useService } from '@rabjs/react';
import { Outlet, useSearchParams } from 'react-router';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '../components/canvas/Canvas.js';
import { CardDetail } from '../components/canvas/CardDetail.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ContextMenu } from '../components/ContextMenu.js';
import { HelpPanel } from '../components/HelpPanel.js';
import { Rail } from '../components/rail/Rail.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { SettingsDialog } from '../settings/SettingsDialog.js';
import { SETTINGS_SECTIONS } from '../settings/sections.js';
import { ConversationService } from './conversation.service.js';
import { MapService } from './map.service.js';
import { ModelCatalogService } from './model-catalog.service.js';
import { SearchService } from './search.service.js';
import { StreamService } from './stream.service.js';

function WorkspaceView() {
  const conversations = useService(ConversationService);
  const map = useService(MapService);
  const search = useService(SearchService);
  const streams = useService(StreamService);
  const [params, setParams] = useSearchParams();
  const settings = params.get('settings');
  const settingsSection = SETTINGS_SECTIONS.find((section) => section === settings) ?? null;

  useEffect(() => {
    void conversations.init();
    return streams.watch();
  }, [conversations, streams]);

  useEffect(() => {
    if (!settingsSection) return;
    if (search.searchOpen) search.setOpen(false);
    if (map.helpOpen) map.setHelpOpen(false);
  }, [settingsSection, search, map]);

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
      <CardDetail />
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
      {map.notice ? (
        <button type="button" className="notice" onClick={() => map.setNotice('')}>
          {map.notice}
        </button>
      ) : null}
    </div>
  );
}

export const Workspace = bindServices(WorkspaceView, [
  ConversationService,
  ModelCatalogService,
  MapService,
  SearchService,
  StreamService,
]);
