import { observer, useService } from '@rabjs/react';
import { PROVIDER_LABELS } from '@tributary/domain';
import { ModelCatalogService } from '../workspace/model-catalog.service.js';
import { ProviderMark } from './ProviderMark.js';

/** 脑图节点和演示页上的回答署名：哪个供应商的哪个模型写出了这段回复。 */
export const AnswerBadge = observer(function AnswerBadge({
  providerId,
  model,
  className,
}: {
  providerId: string | null;
  model: string;
  className?: string;
}) {
  const catalog = useService(ModelCatalogService);
  const provider = catalog.configs.find((config) => config.id === providerId)?.provider ?? null;
  const label = provider ? PROVIDER_LABELS[provider] : null;
  const text = label ? `${label} · ${model}` : model;
  return (
    <p className={className ? `answer-badge ${className}` : 'answer-badge'} title={`由 ${text} 回答`}>
      <ProviderMark provider={provider} size={12} />
      <span>{text}</span>
    </p>
  );
});
