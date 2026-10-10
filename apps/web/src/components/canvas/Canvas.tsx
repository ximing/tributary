import { useMemo, useState } from 'react';
import { Background, MarkerType, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { SendHorizontal } from 'lucide-react';
import { ancestorIds, layoutTree, topLeft } from '@tributary/domain';
import {
  DEFAULT_NODE_HEIGHT,
  DRAFT_NODE_HEIGHT,
  NODE_WIDTH,
  useWorkspace,
  visibleTreeOf,
} from '../../store/workspace.js';
import { BRANCH_PALETTES, useCanvasSettings } from '../../lib/canvasSettings.js';
import { cssVar, useTheme } from '../../lib/theme.js';
import { truncate } from '../../lib/format.js';
import { readViewport, writeViewport } from '../../lib/viewportMemory.js';
import { ModelChip } from '../ModelChip.js';
import { consumeDragClick, DragGhost } from './branchDrag.js';
import { CanvasDock } from './CanvasDock.js';
import { CanvasToolbar } from './CanvasToolbar.js';
import { DraftNodeView } from './DraftNode.js';
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
function FocusPath() {
  const focusId = useWorkspace((state) => state.focusId);
  const nodes = useWorkspace((state) => state.nodes);
  const nodeOrder = useWorkspace((state) => state.nodeOrder);
  const focusBranch = useWorkspace((state) => state.focusBranch);
  const toggleFocus = useWorkspace((state) => state.toggleFocus);
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
          <button type="button" className={id === focusId ? 'is-current' : undefined} title={nodes[id]?.question} onClick={() => focusBranch(id)}>
            {truncate(nodes[id]?.question ?? '', 16)}
          </button>
        </span>
      ))}
      <button type="button" className="focus-back" onClick={() => toggleFocus()}>
        返回全图
      </button>
    </nav>
  );
}

function LinkChip() {
  const linkFrom = useWorkspace((state) => state.linkFrom);
  const question = useWorkspace((state) => (state.linkFrom ? state.nodes[state.linkFrom]?.question : ''));
  const cancelLink = useWorkspace((state) => state.cancelLink);
  if (!linkFrom) return null;
  return (
    <div className="link-chip">
      从「{truncate(question ?? '', 16)}」连出
      <button type="button" onClick={() => cancelLink()}>
        取消
      </button>
    </div>
  );
}

/** 空对话时画布中央的第一问（替代原底部 Composer） */
function EmptyHero() {
  const submit = useWorkspace((state) => state.submit);
  const [text, setText] = useState('');

  const ask = () => {
    const value = text.trim();
    if (!value) return;
    void submit(value).then(() => setText(''));
  };

  return (
    <div className="hero">
      <p className="mark">支</p>
      <h2>从一个问题开始</h2>
      <p className="sub">每个回答都能继续分叉，长成一棵树</p>
      <div className="hero-input">
        <textarea
          rows={2}
          aria-label="第一个问题"
          placeholder="输入你的问题…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
        />
        <button type="button" className="send-btn" aria-label="提问" disabled={!text.trim()} onClick={ask}>
          <SendHorizontal size={13} aria-hidden />
        </button>
      </div>
      <div className="hero-foot">
        <ModelChip />
        <span className="tip">
          <kbd>⏎</kbd> 提问 · 双击画板也可以
        </span>
      </div>
    </div>
  );
}

export function Canvas() {
  const nodes = useWorkspace((state) => state.nodes);
  const nodeOrder = useWorkspace((state) => state.nodeOrder);
  const drafts = useWorkspace((state) => state.drafts);
  const heights = useWorkspace((state) => state.heights);
  const selectedId = useWorkspace((state) => state.selectedId);
  const focusId = useWorkspace((state) => state.focusId);
  const activeId = useWorkspace((state) => state.activeId);
  const clickNode = useWorkspace((state) => state.clickNode);
  const select = useWorkspace((state) => state.select);
  const setMenu = useWorkspace((state) => state.setMenu);
  const openDraft = useWorkspace((state) => state.openDraft);
  const links = useWorkspace((state) => state.links);
  const setConfirm = useWorkspace((state) => state.setConfirm);
  const removeLink = useWorkspace((state) => state.removeLink);
  const cancelLink = useWorkspace((state) => state.cancelLink);
  const theme = useTheme();
  const settings = useCanvasSettings();

  const tree = useMemo(
    () => visibleTreeOf({ nodes, nodeOrder, drafts, focusId }),
    [nodes, nodeOrder, drafts, focusId],
  );

  // SVG 属性吃不到 var()，主题切换时重读计算值
  const dotColor = useMemo(() => cssVar('--edge') || '#c4b69e', [theme]);
  const maskColor = useMemo(() => cssVar('--mask') || 'rgba(0,0,0,0.2)', [theme]);
  const minimapBase = useMemo(() => cssVar('--line-strong') || '#d2c5ae', [theme]);
  const minimapAccent = useMemo(() => cssVar('--accent') || '#b4442c', [theme]);

  /** 分支着色：一级分支（根的直接子节点）定色，整棵子树继承 */
  const branchColor = useMemo(() => {
    if (!settings.branchColors) return () => null;
    const palette = BRANCH_PALETTES[theme];
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
  }, [settings.branchColors, theme, tree]);

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
      aria-label="脑图画板"
      onDoubleClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.classList.contains('react-flow__pane')) {
          openDraft('root');
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
          clickNode(node.id);
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
          setMenu(null);
          if (useWorkspace.getState().linkFrom) cancelLink();
        }}
        onEdgeClick={(_event, edge) => {
          if (!edge.id.startsWith('link:')) return;
          const linkId = edge.id.slice('link:'.length);
          setConfirm({
            title: '断开这条关系线？',
            confirmLabel: '断开',
            danger: true,
            onConfirm: () => {
              void removeLink(linkId);
            },
          });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, target: 'pane' });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          if (edge.id.startsWith('link:')) {
            setMenu({
              x: event.clientX,
              y: event.clientY,
              target: 'edge',
              linkId: edge.id.slice('link:'.length),
            });
            return;
          }
          setMenu({ x: event.clientX, y: event.clientY, target: 'pane' });
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          if (isDraftId(node.id)) return;
          select(node.id);
          setMenu({ x: event.clientX, y: event.clientY, target: 'node' });
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
}
