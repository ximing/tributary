import { useMemo } from 'react';
import { observer, useService } from '@rabjs/react';
import { Background, MarkerType, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { ancestorIds, layoutTree, topLeft } from '@tributary/domain';
import { BRANCH_PALETTES, CanvasPrefsService } from '../../services/canvas-prefs.service.js';
import { cssVar, ThemeService } from '../../services/theme.service.js';
import { truncate } from '../../lib/format.js';
import { readViewport, writeViewport } from '../../lib/viewportMemory.js';
import { ConversationService } from '../../workspace/conversation.service.js';
import { DEFAULT_NODE_HEIGHT, DRAFT_NODE_HEIGHT, NODE_WIDTH, visibleTreeOf } from '../../workspace/map-model.js';
import { MapService } from '../../workspace/map.service.js';
import { consumeDragClick, DragGhost } from './branchDrag.js';
import { CanvasDock } from './CanvasDock.js';
import { CanvasToolbar } from './CanvasToolbar.js';
import { DraftNodeView } from './DraftNode.js';
import { EmptyHero } from './EmptyHero.js';
import { FitView, FocusHandler } from './FitView.js';
import { MapExport } from './MapExport.js';
import { MapFind } from './MapFind.js';
import { Outline } from './Outline.js';
import { PresentMode } from './PresentMode.js';
import { QuestionNodeView } from './QuestionNode.js';
import { RelationEdge } from './RelationEdge.js';
import '@xyflow/react/dist/style.css';

const nodeTypes = { question: QuestionNodeView, draft: DraftNodeView };
const edgeTypes = { relation: RelationEdge };

function isDraftId(id: string): boolean {
  return id.startsWith('draft-');
}

/** 只看这一枝时，顶上是从根到当前节点的路径。点祖先会把视野放到那一枝。 */
const FocusPath = observer(function FocusPath() {
  const map = useService(MapService);
  const focusId = map.focusId;
  const nodes = map.nodes;
  const nodeOrder = map.nodeOrder;
  if (!focusId || !nodes[focusId]) return null;
  const linked = nodeOrder.flatMap((id) => {
    const node = nodes[id];
    return node ? [{ id: node.id, parentId: node.parentId }] : [];
  });
  const ids = [...ancestorIds(linked, focusId)].reverse();
  ids.push(focusId);
  return (
    <nav className="focus-chip" aria-label="当前分支">
      {ids.map((id, index) => (
        <span key={id} className="focus-crumb">
          {index > 0 ? <span className="focus-sep">/</span> : null}
          <button type="button" className={id === focusId ? 'is-current' : undefined} title={nodes[id]?.question} onClick={() => map.focusBranch(id)}>
            {truncate(nodes[id]?.question ?? '', 16)}
          </button>
        </span>
      ))}
      <button type="button" className="focus-back" onClick={() => map.toggleFocus()}>
        返回全图
      </button>
    </nav>
  );
});

const LinkChip = observer(function LinkChip() {
  const map = useService(MapService);
  if (!map.linkFrom) return null;
  const question = map.nodes[map.linkFrom]?.question ?? '';
  return (
    <div className="link-chip">
      从「{truncate(question, 16)}」连出
      <button type="button" onClick={() => map.cancelLink()}>
        取消
      </button>
    </div>
  );
});

export const Canvas = observer(function Canvas() {
  const map = useService(MapService);
  const conversations = useService(ConversationService);
  const theme = useService(ThemeService);
  const prefs = useService(CanvasPrefsService);
  const nodes = map.nodes;
  const nodeOrder = map.nodeOrder;
  const drafts = map.drafts;
  const heights = map.heights;
  const selectedId = map.selectedId;
  const focusId = map.focusId;
  const activeId = conversations.activeId;
  const links = map.links;
  const settings = prefs.settings;

  const tree = useMemo(
    () => visibleTreeOf({ nodes, nodeOrder, drafts, focusId }),
    [nodes, nodeOrder, drafts, focusId],
  );

  // SVG 属性吃不到 var()，主题切换时重读计算值
  const dotColor = useMemo(() => cssVar('--edge') || '#c9c9d8', [theme.theme]);
  const maskColor = useMemo(() => cssVar('--mask') || 'rgba(0,0,0,0.2)', [theme.theme]);
  const minimapBase = useMemo(() => cssVar('--line-strong') || '#d4d4e0', [theme.theme]);
  const minimapAccent = useMemo(() => cssVar('--accent') || '#6d5ae0', [theme.theme]);

  /** 分支着色：一级分支（根的直接子节点）定色，整棵子树继承 */
  const branchColor = useMemo(() => {
    if (!settings.branchColors) return () => null;
    const palette = BRANCH_PALETTES[theme.theme];
    const byId = new Map(tree.map((node) => [node.id, node]));
    const assigned = new Map<string, number>();
    return (id: string): string | null => {
      let branch = id;
      let parent = byId.get(branch)?.parentId ?? null;
      while (parent) {
        const grandparent = byId.get(parent)?.parentId ?? null;
        if (!grandparent) break;
        branch = parent;
        parent = grandparent;
      }
      if (!assigned.has(branch)) assigned.set(branch, assigned.size);
      return palette[assigned.get(branch)! % palette.length];
    };
  }, [settings.branchColors, theme.theme, tree]);

  const flowNodes: Node[] = useMemo(() => {
    const heightOf = (id: string) => heights[id] ?? (isDraftId(id) ? DRAFT_NODE_HEIGHT : DEFAULT_NODE_HEIGHT);
    const points = new Map(
      layoutTree(tree, { heightOf, direction: settings.layout }).map((point) => [point.id, point]),
    );
    return tree.map((node) => {
      const point = points.get(node.id);
      return {
        id: node.id,
        type: isDraftId(node.id) ? 'draft' : 'question',
        position: point ? topLeft(point, heightOf(node.id)) : { x: 0, y: 0 },
        selected: node.id === selectedId,
        draggable: false,
        data: {},
        style: { width: NODE_WIDTH },
        // 节点是受控的，测量结果不会写回。MiniMap 只认节点自身的尺寸，缺了就一个矩形都不画。
        initialWidth: NODE_WIDTH,
        initialHeight: heightOf(node.id),
      };
    });
  }, [tree, heights, selectedId, settings.layout]);

  const edges: Edge[] = useMemo(() => {
    const ids = new Set(tree.map((node) => node.id));
    const treeEdges = tree.flatMap((node) => {
      if (!node.parentId || !ids.has(node.parentId)) return [];
      const isDraft = isDraftId(node.id);
      const isActive = isDraft || node.id === selectedId;
      const branchStroke = settings.branchColors && !isDraft ? branchColor(node.id) : null;
      return [
        {
          id: `${node.parentId}-${node.id}`,
          source: node.parentId,
          target: node.id,
          type: settings.edgeStyle,
          ...(settings.edgeStyle === 'smoothstep' ? { pathOptions: { borderRadius: 18 } } : {}),
          ...(isDraft
            ? { animated: true, style: { strokeDasharray: '6 5', stroke: 'var(--accent)' } }
            : branchStroke
              ? { style: { stroke: branchStroke, strokeWidth: isActive ? 2.2 : 1.5 } }
              : {}),
          ...(!isDraft && !branchStroke && isActive ? { className: 'is-active' } : {}),
        },
      ];
    });
    const relations: Edge[] = links.flatMap((link) => {
      if (!ids.has(link.sourceId) || !ids.has(link.targetId)) return [];
      return [
        {
          id: `link:${link.id}`,
          source: link.sourceId,
          target: link.targetId,
          type: 'relation',
          className: 'is-relation',
          style: { stroke: minimapAccent, strokeDasharray: '2 5', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: minimapAccent, width: 16, height: 16 },
          interactionWidth: 14,
        },
      ];
    });
    return [...treeEdges, ...relations];
  }, [tree, selectedId, settings.edgeStyle, settings.branchColors, branchColor, links, minimapAccent]);

  return (
    <div
      className="flow"
      role="region"
      aria-label="脑图画板"
      onDoubleClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.classList.contains('react-flow__pane')) {
          map.openDraft('root');
        }
      }}
    >
      {!activeId ? <p className="empty-hint">在左侧选择或新建对话</p> : null}
      {activeId && tree.length === 0 ? <EmptyHero /> : null}
      <FocusPath />
      <LinkChip />
      <MapFind />
      <PresentMode />
      <Outline />
      <DragGhost />
      <CanvasToolbar />
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_event, node) => {
          if (consumeDragClick()) return;
          if (isDraftId(node.id)) return;
          map.clickNode(node.id);
        }}
        onMoveEnd={(_event, viewport) => {
          if (!activeId) return;
          const saved = readViewport(activeId);
          // 画布刚挂上会以原点、100% 报一次结束。这时还没恢复记住的视口，不能盖掉。
          const isReset = viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1;
          const savedDiffers = saved !== null && (saved.x !== 0 || saved.y !== 0 || saved.zoom !== 1);
          if (isReset && savedDiffers) return;
          writeViewport(activeId, viewport);
        }}
        onPaneClick={() => {
          map.setMenu(null);
          if (map.linkFrom) map.cancelLink();
        }}
        onEdgeClick={(_event, edge) => {
          if (!edge.id.startsWith('link:')) return;
          const linkId = edge.id.slice('link:'.length);
          map.setConfirm({
            title: '断开这条关系线？',
            confirmLabel: '断开',
            danger: true,
            onConfirm: () => {
              void map.removeLink(linkId);
            },
          });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          map.setMenu({ x: event.clientX, y: event.clientY, target: 'pane' });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          if (edge.id.startsWith('link:')) {
            map.setMenu({
              x: event.clientX,
              y: event.clientY,
              target: 'edge',
              linkId: edge.id.slice('link:'.length),
            });
            return;
          }
          map.setMenu({ x: event.clientX, y: event.clientY, target: 'pane' });
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          if (isDraftId(node.id)) return;
          map.select(node.id);
          map.setMenu({ x: event.clientX, y: event.clientY, target: 'node' });
        }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        // 触控板/滚轮滑动平移；按住 ⌘ 或 Ctrl 再滑动则缩放。捏合仍缩放。
        panOnScroll
        panOnScrollSpeed={1}
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode={['Meta', 'Control']}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={dotColor} gap={24} />
        <MapExport />
        {settings.minimap ? (
          <MiniMap
            pannable
            zoomable
            style={{ width: 160, height: 110 }}
            maskColor={maskColor}
            nodeColor={(node) => (node.id === selectedId ? minimapAccent : minimapBase)}
            nodeStrokeColor={minimapBase}
            nodeBorderRadius={4}
          />
        ) : null}
        <CanvasDock />
        <FitView conversationId={activeId} count={tree.length} layout={settings.layout} />
        <FocusHandler />
      </ReactFlow>
    </div>
  );
});
