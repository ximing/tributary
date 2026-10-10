import { useEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useWorkspace } from '../store/workspace.js';

/** 应用内确认浮层：危险操作（删除子树等）的二次确认。Enter 确认，Esc 取消。 */
export function ConfirmDialog() {
  const confirm = useWorkspace((state) => state.confirm);
  const setConfirm = useWorkspace((state) => state.setConfirm);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirm) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') setConfirm(null);
      if (event.key === 'Enter') {
        confirm.onConfirm();
        setConfirm(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirm, setConfirm]);

  if (!confirm) return null;

  const close = () => setConfirm(null);

  return (
    <div className="help-overlay" onClick={close}>
      <div
        className="confirm-panel"
        role="alertdialog"
        aria-label={confirm.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`confirm-icon${confirm.danger ? ' is-danger' : ''}`}>
          <TriangleAlert size={18} aria-hidden />
        </div>
        <h2>{confirm.title}</h2>
        {confirm.detail ? <p className="confirm-detail">{confirm.detail}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" ref={cancelRef} onClick={close}>
            取消
          </button>
          <button
            type="button"
            className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              confirm.onConfirm();
              close();
            }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
