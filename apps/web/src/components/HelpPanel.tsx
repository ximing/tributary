import { CircleHelp } from 'lucide-react';
import { SHORTCUTS } from '@tributary/domain';
import { useWorkspace } from '../store/workspace.js';

const GROUPS: { title: string; ids: string[] }[] = [
  { title: '编辑', ids: ['child', 'sibling', 'toggle'] },
  { title: '导航', ids: ['up', 'down', 'left', 'right'] },
  { title: '视图', ids: ['deselect', 'help'] },
  { title: '应用', ids: [] },
];

const EXTRA: { group: string; hint: string; label: string }[] = [
  { group: '编辑', hint: 'Del', label: '删除节点及子分支' },
  { group: '视图', hint: '滑动', label: '移动画布' },
  { group: '视图', hint: '⌘ 滑动', label: '缩放画布' },
  { group: '视图', hint: '⇧ F', label: '适应视图' },
  { group: '视图', hint: '⌘ +/-', label: '缩放画布' },
  { group: '视图', hint: '⇧ D', label: '切换明暗主题' },
  { group: '视图', hint: '[ / ]', label: '收起 / 展开侧栏' },
  { group: '应用', hint: '⌘ K', label: '搜索对话' },
  { group: '应用', hint: '⌘ ,', label: '打开设置' },
  { group: '应用', hint: '双击', label: '画布空白处新建根问题' },
];

/** `?` 打开的快捷键帮助浮层 */
export function HelpPanel() {
  const open = useWorkspace((state) => state.helpOpen);
  const setHelpOpen = useWorkspace((state) => state.setHelpOpen);

  if (!open) return null;

  return (
    <div className="help-overlay" onClick={() => setHelpOpen(false)}>
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
}
