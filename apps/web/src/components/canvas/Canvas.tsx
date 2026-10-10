import { useMemo, useState } from 'react';
import { Background, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { SendHorizontal } from 'lucide-react';
import { layoutTree, topLeft } from '@tributary/domain';
import {
  DEFAULT_NODE_HEIGHT,
  DRAFT_NODE_HEIGHT,
  NODE_WIDTH,
  useWorkspace,
  visibleTreeOf,
} from '../../store/workspace.js';
import { BRANCH_PALETTES, useCanvasSettings } from '../../lib/canvasSettings.js';
import { cssVar, useTheme } from '../../lib/theme.js';
import { ModelChip } from '../ModelChip.js';
import { CanvasDock } from './CanvasDock.js';
import { CanvasToolbar } from './CanvasToolbar.js';
import { DraftNodeView } from './DraftNode.js';
import { FitView, FocusHandler } from './FitView.js';
import { QuestionNodeView } from './QuestionNode.js';
import '@xyflow/react/dist/style.css';

const nodeTypes = { question: QuestionNodeView, draft: DraftNodeView };

function isDraftId(id: string): boolean {
  return id.startsWith('draft-');
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
  const activeId = useWorkspace((state) => state.activeId);
  const clickNode = useWorkspace((state) => state.clickNode);
  const select = useWorkspace((state) => state.select);
  const setMenu = useWorkspace((state) => state.setMenu);
  const openDraft = useWorkspace((state) => state.openDraft);
  const theme = useTheme();
  const settings = useCanvasSettings();

  const tree = useMemo(() => visibleTreeOf({ nodes, nodeOrder, drafts }), [nodes, nodeOrder, drafts]);

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
    return tree.flatMap((node) => {
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
  }, [tree, selectedId, settings.edgeStyle, settings.branchColors, branchColor]);

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
      <CanvasToolbar />
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => {
          if (isDraftId(node.id)) return;
          clickNode(node.id);
        }}
        onPaneClick={() => setMenu(null)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          if (isDraftId(node.id)) return;
          select(node.id);
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        fitView
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
