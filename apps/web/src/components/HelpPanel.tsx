import { observer, useService } from '@rabjs/react';
import { CircleHelp } from 'lucide-react';
import { SHORTCUTS } from '@tributary/domain';
import { MapService } from '../workspace/map.service.js';

const GROUPS: { title: string; ids: string[] }[] = [
  { title: '编辑', ids: ['child', 'sibling', 'edit', 'collapse'] },
  { title: '导航', ids: ['up', 'down', 'left', 'right'] },
  { title: '视图', ids: ['deselect', 'help'] },
  { title: '应用', ids: [] },
];

const EXTRA: { group: string; hint: string; label: string }[] = [
  { group: '编辑', hint: '⌥→', label: '收到上一同级下' },
  { group: '编辑', hint: '⌥←', label: '升一级' },
  { group: '编辑', hint: '⌥↑ / ⌥↓', label: '调整同级顺序' },
  { group: '编辑', hint: '⇧ Space', label: '展开/收起回复' },
  { group: '编辑', hint: '⌘ C', label: '复制问题' },
  { group: '编辑', hint: '⌘ ⇧ C', label: '复制回答' },
  { group: '编辑', hint: '双击', label: '编辑问题' },
  { group: '编辑', hint: '⌘ Z', label: '撤回' },
  { group: '编辑', hint: '⌘ ⇧ Z', label: '重做' },
  { group: '编辑', hint: '⌘ D', label: '复制这一枝' },
  { group: '编辑', hint: 'Del', label: '删除节点及子分支' },
  { group: '视图', hint: '⌘ F', label: '在这张图里查找' },
  { group: '视图', hint: '⌘ G', label: '下一个匹配' },
  { group: '视图', hint: '⌘ \\', label: '只看这一枝' },
  { group: '视图', hint: '演示', label: '按树的顺序逐张看' },
  { group: '编辑', hint: '笔记里 ⌘ Enter', label: '保存笔记' },
  { group: '视图', hint: '滑动', label: '移动画布' },
  { group: '视图', hint: '⌘ 滑动', label: '缩放画布' },
  { group: '视图', hint: '⇧ F', label: '适应视图' },
  { group: '视图', hint: '⌘ +/-', label: '缩放画布' },
  { group: '视图', hint: '⇧ D', label: '切换明暗主题' },
  { group: '视图', hint: '[ / ]', label: '收起 / 展开侧栏' },
  { group: '应用', hint: '⌘ K', label: '搜索对话' },
  { group: '应用', hint: '⌘ ,', label: '打开设置' },
  { group: '应用', hint: '双击空白', label: '画布空白处新建根问题' },
  { group: '视图', hint: '右键空白', label: '打开画布菜单' },
  { group: '编辑', hint: '右键关系线', label: '选中两端或断开' },
];

/** `?` 打开的快捷键帮助浮层 */
export const HelpPanel = observer(function HelpPanel() {
  const map = useService(MapService);

  if (!map.helpOpen) return null;

  return (
    <div className="help-overlay" onClick={() => map.setHelpOpen(false)}>
      <div className="help-panel" role="dialog" aria-label="快捷键帮助" onClick={(event) => event.stopPropagation()}>
        <h2>
          <CircleHelp size={18} aria-hidden />
          快捷键
        </h2>
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <ul>
              {SHORTCUTS.filter((shortcut) => group.ids.includes(shortcut.id)).map((shortcut) => (
                <li key={shortcut.id}>
                  <kbd>{shortcut.hint}</kbd>
                  <span>{shortcut.label}</span>
                </li>
              ))}
              {EXTRA.filter((item) => item.group === group.title).map((item) => (
                <li key={item.label}>
                  <kbd>{item.hint}</kbd>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
});
