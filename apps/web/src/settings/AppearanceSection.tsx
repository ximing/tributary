import { observer, useService } from '@rabjs/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemeService, type ThemeMode } from '../services/theme.service.js';

/** 外观：纸 / 墨 / 跟随系统。主题存在应用级 ThemeService。 */
export const AppearanceSection = observer(function AppearanceSection() {
  const theme = useService(ThemeService);
  const cards: { value: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
    { value: 'light', label: '纸 · 亮色', hint: '米白纸面，适合白天', icon: Sun },
    { value: 'dark', label: '墨 · 暗色', hint: '深夜墨底，适合弱光', icon: Moon },
    { value: 'system', label: '跟随系统', hint: `当前为${theme.theme === 'dark' ? '暗色' : '亮色'}`, icon: Monitor },
  ];
  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>外观</h2>
        <p className="section-lede">主题随系统或手动固定，画布与所有页面即时生效。</p>
      </div>
      <p className="sec-sub">主题</p>
      <div className="theme-cards" role="radiogroup" aria-label="主题">
        {cards.map((card) => (
          <button
            key={card.value}
            type="button"
            role="radio"
            aria-checked={theme.mode === card.value}
            className={`theme-card${theme.mode === card.value ? ' is-on' : ''}`}
            onClick={() => theme.setMode(card.value)}
          >
            <span className={`thumb thumb-${card.value}`} aria-hidden />
            <span className="theme-card-name">
              <card.icon size={13} aria-hidden />
              {card.label}
            </span>
            <span className="theme-card-hint">{card.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
});
