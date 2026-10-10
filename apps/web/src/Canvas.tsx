import { useEffect } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { layoutTree, SHORTCUTS, visibleNodes, type TreeNode } from '@tributary/domain';
import '@xyflow/react/dist/style.css';

export interface MapNode {
  id: string;
  parentId: string | null;
  question: string;
  reply: string | null;
  collapsed: boolean;
}

interface QuestionData extends Record<string, unknown> {
  question: string;
  reply: string | null;
  expanded: boolean;
}

type QuestionFlowNode = Node<QuestionData, 'question'>;

function QuestionNodeView({ data }: NodeProps<QuestionFlowNode>) {
  return (
    <div className="question-card" role="treeitem" aria-expanded={data.expanded} aria-label={data.question}>
      <Handle type="target" position={Position.Left} />
      <p className="question">{data.question}</p>
      <p className="reply">{data.reply ?? '思考中…'}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { question: QuestionNodeView };

function FitView({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.25, duration: 150 });
    });
    return () => cancelAnimationFrame(frame);
  }, [signature, fitView]);
  return null;
}

function label(id: (typeof SHORTCUTS)[number]['id']): string {
  return SHORTCUTS.find((shortcut) => shortcut.id === id)?.label ?? id;
}

export function Canvas({
  nodes,
  selectedId,
  menu,
  onSelect,
  onContextMenu,
  onDismissMenu,
  onAdd,
  onToggle,
}: {
  nodes: MapNode[];
  selectedId: string | null;
  menu: { x: number; y: number } | null;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onDismissMenu: () => void;
  onAdd: (relation: 'child' | 'sibling') => void;
  onToggle: () => void;
}) {
  const tree: TreeNode[] = nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    question: node.question,
    reply: node.reply,
    collapsed: node.collapsed,
  }));
  const visible = visibleNodes(tree);
  const points = new Map(layoutTree(visible).map((point) => [point.id, point]));
  const flowNodes: QuestionFlowNode[] = visible.map((node) => {
    const point = points.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      type: 'question',
      position: { x: point.x, y: point.y },
      width: 220,
      height: 88,
      selected: node.id === selectedId,
      data: {
        question: node.question,
        reply: node.reply,
        expanded: !node.collapsed,
      },
      style: { width: 220, visibility: 'visible' },
    };
  });
  const visibleIds = new Set(visible.map((node) => node.id));
  const edges: Edge[] = visible.flatMap((node) => {
    if (!node.parentId || !visibleIds.has(node.parentId)) return [];
    return [{ id: `${node.parentId}-${node.id}`, source: node.parentId, target: node.id, type: 'smoothstep' }];
  });

  return (
    <div className="flow" aria-label="脑图画板">
      {nodes.length === 0 ? <p className="empty-hint">在左侧选择或新建对话</p> : null}
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => {
          onDismissMenu();
          onSelect(node.id);
        }}
        onPaneClick={onDismissMenu}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onContextMenu(node.id, event.clientX, event.clientY);
        }}
        fitView
        minZoom={0.2}
        maxZoom={1.6}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d9cbb8" gap={22} />
        <MiniMap pannable zoomable style={{ width: 200, height: 150 }} maskColor="rgba(28, 25, 21, 0.08)" />
        <Controls showInteractive={false} />
        <FitView signature={visible.map((node) => node.id).join(',')} />
      </ReactFlow>
      {menu ? (
        <div className="menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button type="button" role="menuitem" onClick={() => onAdd('child')}>
            {label('child')}
          </button>
          <button type="button" role="menuitem" onClick={() => onAdd('sibling')}>
            {label('sibling')}
          </button>
          <button type="button" role="menuitem" onClick={onToggle}>
            {label('toggle')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
