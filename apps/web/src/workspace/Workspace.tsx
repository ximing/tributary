import { useCallback, useEffect, useRef } from 'react';
import { bindServices, useService } from '@rabjs/react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
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
import { initialMapRoute, mapIdFromLocation, MIND_PATH, nextMapRoute, searchWithId } from '../lib/mapRoute.js';
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
  const location = useLocation();
  const mapId = mapIdFromLocation(location.pathname, location.search);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const settings = params.get('settings');
  const settingsSection = SETTINGS_SECTIONS.find((section) => section === settings) ?? null;
  const activeId = conversations.activeId;
  const restored = conversations.restored;
  const seen = useRef(initialMapRoute);

  useEffect(() => {
    void conversations.init(mapIdFromLocation(window.location.pathname, window.location.search));
    return streams.watch();
  }, [conversations, streams]);

  useEffect(() => {
    if (!restored) return;
    const result = nextMapRoute(seen.current, mapId, activeId);
    seen.current = result.seen;
    if (result.action.type === 'open') void conversations.open(result.action.id);
    else if (result.action.type === 'leave') conversations.leave();
    else if (result.action.type === 'navigate') {
      navigate(
        {
          pathname: result.action.id ? MIND_PATH : '/',
          search: searchWithId(location.search, result.action.id),
        },
        { replace: result.action.replace },
      );
    }
  }, [restored, mapId, activeId, conversations, navigate, location.search]);

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
