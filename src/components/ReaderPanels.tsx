import type { BookmarkRecord, ReaderSettings, ThemeName } from '../types';
import { FONT_SIZE_STEPS, LINE_HEIGHT_STEPS, MARGIN_STEPS } from '../types';
import type { TocEntry } from '../engine/ReaderEngine';
import { READER_THEMES } from '../lib/theme';
import { basename, cx, formatRelativeDay } from '../lib/utils';
import { MinusIcon, PlusIcon, TrashIcon, XIcon } from './Icons';

export function TocDrawer({
  toc,
  currentHref,
  canPrev,
  canNext,
  onSelect,
  onPrev,
  onNext,
  onClose,
}: {
  toc: TocEntry[];
  currentHref: string;
  canPrev: boolean;
  canNext: boolean;
  onSelect: (href: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const current = basename(currentHref);

  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="目录">
        <div className="drawer-head">
          <span>目录</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭目录">
            <XIcon size={16} />
          </button>
        </div>
        <div className="drawer-body">
          {toc.length === 0 && <div className="panel-empty">这本书没有提供目录</div>}
          {toc.map((entry, index) => (
            <button
              type="button"
              key={`${entry.href}-${index}`}
              className={cx('toc-item', basename(entry.href) === current && 'is-current')}
              style={{ paddingLeft: 18 + entry.depth * 14 }}
              onClick={() => onSelect(entry.href)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="toc-foot">
          <button type="button" onClick={onPrev} disabled={!canPrev}>
            上一章
          </button>
          <button type="button" onClick={onNext} disabled={!canNext}>
            下一章
          </button>
        </div>
      </aside>
    </>
  );
}

const THEME_ORDER: ThemeName[] = ['day', 'sepia', 'night'];

export function SettingsSheet({
  settings,
  update,
  onClose,
}: {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
  onClose: () => void;
}) {
  const sizeIndex = Math.max(0, FONT_SIZE_STEPS.indexOf(settings.fontSize));
  const stepSize = (delta: number) => {
    const next = FONT_SIZE_STEPS[Math.min(FONT_SIZE_STEPS.length - 1, Math.max(0, sizeIndex + delta))];
    update({ fontSize: next });
  };

  return (
    <>
      <div className="veil" onClick={onClose} />
      <div className="sheet-wrap" onClick={onClose}>
        <div className="sheet" role="dialog" aria-label="排版设置" onClick={(event) => event.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="sheet-head">
            <span className="sheet-title">排版</span>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭排版设置">
              <XIcon size={16} />
            </button>
          </div>

          <div className="row">
            <span className="row-label">主题</span>
            <div className="swatches">
              {THEME_ORDER.map((theme) => (
                <button
                  type="button"
                  key={theme}
                  className={cx('swatch', settings.theme === theme && 'is-on')}
                  onClick={() => update({ theme })}
                >
                  <i style={{ background: READER_THEMES[theme].bg }} />
                  {READER_THEMES[theme].label}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <span className="row-label">字号</span>
            <div className="stepper">
              <button type="button" onClick={() => stepSize(-1)} disabled={sizeIndex === 0} aria-label="减小字号">
                <MinusIcon size={15} />
              </button>
              <span className="stepper-value">{settings.fontSize}px</span>
              <button
                type="button"
                onClick={() => stepSize(1)}
                disabled={sizeIndex === FONT_SIZE_STEPS.length - 1}
                aria-label="增大字号"
              >
                <PlusIcon size={15} />
              </button>
            </div>
          </div>

          <div className="row">
            <span className="row-label">行距</span>
            <div className="segmented">
              {LINE_HEIGHT_STEPS.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={cx(settings.lineHeight === value && 'is-on')}
                  onClick={() => update({ lineHeight: value })}
                >
                  {value.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <span className="row-label">页边距</span>
            <div className="segmented">
              {MARGIN_STEPS.map((value, index) => (
                <button
                  type="button"
                  key={value}
                  className={cx(settings.margin === value && 'is-on')}
                  onClick={() => update({ margin: value })}
                >
                  {['窄', '中', '宽'][index]}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <span className="row-label">字体</span>
            <div className="segmented">
              <button
                type="button"
                className={cx(settings.fontFamily === 'serif' && 'is-on')}
                onClick={() => update({ fontFamily: 'serif' })}
              >
                宋体
              </button>
              <button
                type="button"
                className={cx(settings.fontFamily === 'sans' && 'is-on')}
                onClick={() => update({ fontFamily: 'sans' })}
              >
                黑体
              </button>
            </div>
          </div>

          <p className="sheet-note">排版设置对所有书生效。调整后会自动回到刚才读到的那一段。</p>
        </div>
      </div>
    </>
  );
}

export function BookmarksSheet({
  items,
  onSelect,
  onDelete,
  onClose,
}: {
  items: BookmarkRecord[];
  onSelect: (cfi: string) => void;
  onDelete: (bookmark: BookmarkRecord) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="veil" onClick={onClose} />
      <div className="sheet-wrap" onClick={onClose}>
        <div className="sheet" role="dialog" aria-label="书签" onClick={(event) => event.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="sheet-head">
            <span className="sheet-title">书签 · {items.length}</span>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭书签">
              <XIcon size={16} />
            </button>
          </div>

          {items.length === 0 ? (
            <div className="panel-empty">
              还没有书签。
              <br />
              读到值得记住的地方，点右上角的书签按钮。
            </div>
          ) : (
            items.map((item) => (
              <div className="bm-item" key={item.id}>
                <button type="button" className="bm-main" onClick={() => onSelect(item.cfi)}>
                  <div className="bm-quote">{item.excerpt || '（无摘录）'}</div>
                  <div className="bm-meta">
                    {item.excerpt !== item.chapterTitle && (
                      <>
                        <span>{item.chapterTitle}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{formatRelativeDay(item.createdAt)}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="bm-del"
                  aria-label="删除书签"
                  onClick={() => onDelete(item)}
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
