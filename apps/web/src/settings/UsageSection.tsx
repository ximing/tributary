import { useEffect } from 'react';
import { bindServices, useService } from '@rabjs/react';
import { providerFromLabel } from '@tributary/domain';
import { Bot, ChartColumn, Lightbulb } from 'lucide-react';
import { ProviderMark } from '../components/ProviderMark.js';
import { relativeTime } from '../lib/format.js';
import { UsageSettingsService } from './usage-settings.service.js';

function UsageSectionView() {
  const usage = useService(UsageSettingsService);
  const view = usage.view;

  useEffect(() => {
    void usage.load();
  }, [usage]);

  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>用量</h2>
        <p className="section-lede">只统计你自己的调用。总览是累计，明细是每一次。</p>
      </div>
      {usage.error ? (
        <p className="form-error" role="alert">
          {usage.error}
        </p>
      ) : null}
      {view ? (
        <>
          <h3>总览</h3>
          <div className="usage-cards">
            <div className="usage-card">
              <div className="label">
                <Lightbulb size={14} aria-hidden />
                提示词 tokens
              </div>
              <div className="num">{view.promptTokens.toLocaleString()}</div>
            </div>
            <div className="usage-card">
              <div className="label">
                <Bot size={14} aria-hidden />
                补全 tokens
              </div>
              <div className="num">{view.completionTokens.toLocaleString()}</div>
            </div>
            <div className="usage-card is-total">
              <div className="label">
                <ChartColumn size={14} aria-hidden />
                合计 tokens
              </div>
              <div className="num">{view.totalTokens.toLocaleString()}</div>
            </div>
          </div>
          {view.byModel.length > 0 ? (
            <ul className="usage-groups">
              {view.byModel.map((group) => (
                <li key={`${group.providerName}:${group.model}`}>
                  <strong>
                    <ProviderMark provider={providerFromLabel(group.providerName)} size={14} />
                    {group.providerName}
                  </strong>
                  <span>{group.model}</span>
                  <span>
                    {group.calls} 次 · {group.totalTokens.toLocaleString()} tokens
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-lede">还没有调用。</p>
          )}
          <h3>明细</h3>
          {view.calls.length === 0 ? (
            <p className="section-lede">调用完成后会出现在这里。</p>
          ) : (
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>供应商</th>
                    <th>模型</th>
                    <th>提示</th>
                    <th>补全</th>
                    <th>合计</th>
                  </tr>
                </thead>
                <tbody>
                  {view.calls.map((call) => (
                    <tr key={call.id}>
                      <td>{relativeTime(call.createdAt)}</td>
                      <td>
                        <span className="usage-provider">
                          <ProviderMark provider={providerFromLabel(call.providerName)} size={13} />
                          {call.providerName}
                        </span>
                      </td>
                      <td>{call.model}</td>
                      <td>{call.promptTokens.toLocaleString()}</td>
                      <td>{call.completionTokens.toLocaleString()}</td>
                      <td>{call.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

export const UsageSection = bindServices(UsageSectionView, [UsageSettingsService]);
