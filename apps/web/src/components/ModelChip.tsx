import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown } from 'lucide-react';
import { PROVIDER_LABELS } from '@tributary/domain';
import { modelValue, splitModelChoice, useWorkspace } from '../store/workspace.js';

/**
 * 模型选择 chip：草稿节点与空状态 hero 共用。
 * 点击弹出 provider/model 列表，选择写入全局 modelChoice。
 */
export function ModelChip() {
  const configs = useWorkspace((state) => state.configs);
  const modelChoice = useWorkspace((state) => state.modelChoice);
  const setModelChoice = useWorkspace((state) => state.setModelChoice);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const { model } = splitModelChoice(modelChoice);

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="model-chip"
        aria-label="选择模型"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <Bot size={11} aria-hidden />
        {model ?? '选择模型'}
        <ChevronDown size={10} aria-hidden />
      </button>
      {open ? (
        <span className="model-menu nodrag" role="menu">
          {configs.length === 0 ? (
            <span className="empty" style={{ display: 'block' }}>
              先在设置里添加模型
            </span>
          ) : (
            configs.map((config) => {
              const value = modelValue(config.id, config.model);
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  className={value === modelChoice ? 'is-active' : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    setModelChoice(value);
                    setOpen(false);
                  }}
                >
                  <Bot size={12} aria-hidden />
                  {PROVIDER_LABELS[config.provider]} / {config.model}
                </button>
              );
            })
          )}
        </span>
      ) : null}
    </span>
  );
}
