import { observer, useService } from '@rabjs/react';
import { EDGE_STYLE_OPTIONS, LAYOUT_OPTIONS, CanvasPrefsService } from '../services/canvas-prefs.service.js';

/** 画布：布局 / 连线 / 分支着色 / 小地图。和 Dock、右上角设置读同一个服务。 */
export const CanvasSection = observer(function CanvasSection() {
  const prefs = useService(CanvasPrefsService);
  const settings = prefs.settings;
  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>画布</h2>
        <p className="section-lede">布局与连线的全局默认，立即作用于当前画布。</p>
      </div>
      <p className="sec-sub">布局与连线</p>
      <div className="card">
        <div className="form-row">
          <div className="fr-main">
            <div className="fr-label">布局方向</div>
            <div className="fr-hint">节点生长的方向，鱼骨图、放射布局等后续可扩展</div>
          </div>
          <div className="fr-ctl">
            <div className="seg-control" role="radiogroup" aria-label="布局方向">
              {LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.layout === option.value}
                  className={settings.layout === option.value ? 'is-on' : undefined}
                  onClick={() => prefs.patch({ layout: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="fr-main">
            <div className="fr-label">连线样式</div>
            <div className="fr-hint">曲线 / 圆角折线 / 直角折线</div>
          </div>
          <div className="fr-ctl">
            <div className="seg-control" role="radiogroup" aria-label="连线样式">
              {EDGE_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.edgeStyle === option.value}
                  className={settings.edgeStyle === option.value ? 'is-on' : undefined}
                  onClick={() => prefs.patch({ edgeStyle: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="form-row is-button"
          role="switch"
          aria-checked={settings.branchColors}
          onClick={() => prefs.patch({ branchColors: !settings.branchColors })}
        >
          <div className="fr-main">
            <div className="fr-label">分支着色</div>
            <div className="fr-hint">每个一级分支一种颜色，子分支继承</div>
          </div>
          <div className="fr-ctl">
            <span className={`switch${settings.branchColors ? ' is-on' : ''}`} />
          </div>
        </button>
        <button
          type="button"
          className="form-row is-button"
          role="switch"
          aria-checked={settings.minimap}
          onClick={() => prefs.patch({ minimap: !settings.minimap })}
        >
          <div className="fr-main">
            <div className="fr-label">显示小地图</div>
            <div className="fr-hint">画布右下角的全局缩略图</div>
          </div>
          <div className="fr-ctl">
            <span className={`switch${settings.minimap ? ' is-on' : ''}`} />
          </div>
        </button>
      </div>
    </section>
  );
});
