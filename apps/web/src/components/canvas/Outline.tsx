import { observer, useService } from '@rabjs/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { nodesInFocus, outlineRows } from '@tributary/domain';
import { MapService } from '../../workspace/map.service.js';

/** 与画布同步的大纲。点一行会展开祖先、选中，并把节点平移到视野里。 */
export const Outline = observer(function Outline() {
  const map = useService(MapService);

  if (!map.outlineOpen) return null;
  const list = map.nodeOrder.map((id) => map.nodes[id]).filter((node) => Boolean(node));
  const rows = outlineRows(nodesInFocus(list, map.focusId));

  return (
    <aside className="outline" aria-label="大纲">
      <header>
        <h2>大纲</h2>
        <button type="button" onClick={() => map.setOutlineOpen(false)} aria-label="关闭大纲">
          关闭
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="outline-empty">还没有节点</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <div className={`outline-row${row.id === map.selectedId ? ' is-selected' : ''}`} style={{ paddingLeft: 8 + row.depth * 14 }}>
                {row.childCount > 0 ? (
                  <button
                    type="button"
                    className="outline-fold"
                    aria-label={row.collapsed ? '展开' : '折叠'}
                    onClick={() => void map.toggleCollapse(row.id)}
                  >
                    {row.collapsed ? <ChevronRight size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
                  </button>
                ) : (
                  <span className="outline-fold" />
                )}
                <button type="button" className="outline-jump" onClick={() => void map.revealNode(row.id)}>
                  {row.question}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
});
