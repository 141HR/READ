import { useToastStore } from '../state/toast';
import { cx } from '../lib/utils';

export function ToastViewport({ raised = false }: { raised?: boolean }) {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);

  if (items.length === 0) return null;

  return (
    <div className={cx('toast-viewport', raised && 'is-reader')} role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={cx('toast', item.tone === 'error' && 'is-error')}>
          <span>{item.message}</span>
          {item.actionLabel && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                item.onAction?.();
                dismiss(item.id);
              }}
            >
              {item.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
