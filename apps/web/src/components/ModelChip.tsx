import { useEffect, useRef, useState } from 'react';
import { observer, useService } from '@rabjs/react';
import { ChevronDown } from 'lucide-react';
import { PROVIDER_LABELS } from '@tributary/domain';
import { ProviderMark } from './ProviderMark.js';
import { modelValue, splitModelChoice } from '../workspace/map-model.js';
import { ModelCatalogService } from '../workspace/model-catalog.service.js';

/**
 * 模型选择 chip：草稿节点与空状态 hero 共用。
 * 点击弹出 provider/model 列表，选择写入全局 modelChoice。
 */
export const ModelChip = observer(function ModelChip() {
  const catalog = useService(ModelCatalogService);
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

  const modelChoice = catalog.modelChoice;
  const { providerId, model } = splitModelChoice(modelChoice);
  const selected = catalog.configs.find((config) => config.id === providerId) ?? null;

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
        <ProviderMark provider={selected?.provider ?? null} size={12} />
        {model ?? '选择模型'}
        <ChevronDown size={10} aria-hidden />
      </button>
      {open ? (
        <span className="model-menu nodrag" role="menu">
          {catalog.configs.length === 0 ? (
            <span className="empty" style={{ display: 'block' }}>
              先在设置里添加模型
            </span>
          ) : (
            catalog.configs.map((config) => {
              const value = modelValue(config.id, config.model);
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  className={value === modelChoice ? 'is-active' : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    catalog.setChoice(value);
                    setOpen(false);
                  }}
                >
                  <ProviderMark provider={config.provider} size={13} />
                  {PROVIDER_LABELS[config.provider]} / {config.model}
                </button>
              );
            })
          )}
        </span>
      ) : null}
    </span>
  );
});
