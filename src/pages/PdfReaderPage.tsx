import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { db } from '../storage/db';
import {
  addBookmark,
  deleteBookmark,
  getBook,
  getProgress,
  saveProgress,
  touchBook,
} from '../storage/repository';
import { openPdf, readPdfOutline, type PdfHandle, type PdfOutlineEntry } from '../formats/pdf';
import type { BookRecord, ReaderSettings, ThemeName } from '../types';
import { useSettingsStore } from '../state/settings';
import { useToastStore } from '../state/toast';
import { cx, formatPercent, sortBookmarks, uid } from '../lib/utils';
import {
  ArrowLeft,
  BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  ListIcon,
  TypeIcon,
  XIcon,
} from '../components/Icons';
import { BookmarksSheet } from '../components/ReaderPanels';
import { READER_THEMES } from '../lib/theme';

type Panel = 'toc' | 'bookmarks' | 'settings' | null;

type ZoomMode = 'page' | 'actual' | 'width';

const ZOOM_STEPS: Array<{ value: ZoomMode; label: string }> = [
  { value: 'page', label: '整页' },
  { value: 'actual', label: '100%' },
  { value: 'width', label: '适宽' },
];

/** PDF 的点是 1/72 英寸，屏幕是 1/96，scale 1.333 才是纸张原大 */
const ACTUAL_SIZE_SCALE = 96 / 72;

const THEME_ORDER: ThemeName[] = ['day', 'sepia', 'night'];

export function PdfReaderPage({ bookId }: { bookId: string }) {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);
  const pushToast = useToastStore((state) => state.push);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const handleRef = useRef<PdfHandle | null>(null);
  const pageRef = useRef(1);
  const totalRef = useRef(0);
  const outlineRef = useRef<PdfOutlineEntry[]>([]);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const scrubRef = useRef<number | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const saveErrorRef = useRef(false);

  const [book, setBook] = useState<BookRecord | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [scrub, setScrub] = useState<number | null>(null);

  // Android 返回键：先关面板，再关控制层；两者都没有时交给外壳回书架
  useEffect(() => {
    const onBack = (event: Event) => {
      if (panel) {
        event.preventDefault();
        setPanel(null);
        return;
      }
      if (overlay) {
        event.preventDefault();
        setOverlay(false);
      }
    };
    window.addEventListener('read:back', onBack);
    return () => window.removeEventListener('read:back', onBack);
  }, [panel, overlay]);

  // 默认实际大小：适宽会把一页在桌面上放大到两倍，一屏只剩三分之一；整页又偏小
  const zoom: ZoomMode =
    settings.pdfZoom === 'auto'
      ? stageWidth > 0 && stageWidth < 900
        ? 'width'
        : 'actual'
      : settings.pdfZoom;

  const bookmarkRecords =
    useLiveQuery(() => db.bookmarks.where('bookId').equals(bookId).toArray(), [bookId], []) ?? [];
  const bookmarks = useMemo(
    () => sortBookmarks(bookmarkRecords),
    [bookmarkRecords],
  );

  const chapterTitleFor = useCallback((target: number) => {
    const passed = outlineRef.current.filter((entry) => entry.page <= target);
    return passed.length > 0 ? passed[passed.length - 1].label : `第 ${target} 页`;
  }, []);

  const reportSaveError = useCallback(() => {
    if (saveErrorRef.current) return;
    saveErrorRef.current = true;
    pushToast('进度保存失败，本次阅读仍可继续', { tone: 'error' });
  }, [pushToast]);

  const flush = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    const current = pageRef.current;
    const count = totalRef.current;
    if (!count) return;
    void saveProgress({
      bookId,
      cfi: `page:${current}`,
      chapterHref: '',
      chapterTitle: chapterTitleFor(current),
      chapterIndex: current - 1,
      percent: current / count,
      page: current,
      updatedAt: Date.now(),
    }).catch(reportSaveError);
  }, [bookId, chapterTitleFor, reportSaveError]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flush, 600);
  }, [flush]);

  const goToPage = useCallback(
    (target: number) => {
      const count = totalRef.current;
      if (!count) return;
      const next = Math.min(count, Math.max(1, Math.round(target)));
      if (next === pageRef.current) return;
      pageRef.current = next;
      setPage(next);
      setScrub(null);
      stageRef.current?.scrollTo({ top: 0, left: 0 });
      scheduleSave();
    },
    [scheduleSave],
  );

  /**
   * 适宽模式下单页会比屏幕高：先滚动到页尾，再翻页，
   * 否则一次点击会跳过还没读到的半页。
   */
  const advance = useCallback(
    (direction: 1 | -1) => {
      const stage = stageRef.current;
      if (stage) {
        const maxScroll = stage.scrollHeight - stage.clientHeight;
        if (maxScroll > 24) {
          const atEdge =
            direction === 1 ? stage.scrollTop >= maxScroll - 12 : stage.scrollTop <= 12;
          if (!atEdge) {
            stage.scrollBy({
              top: direction * Math.max(96, stage.clientHeight * 0.88),
              behavior: 'smooth',
            });
            return;
          }
        }
      }
      goToPage(pageRef.current + direction);
    },
    [goToPage],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const record = await getBook(bookId);
      if (cancelled) return;
      if (!record) {
        setError('这本书不在书架里，可能已被移除。');
        setLoading(false);
        return;
      }
      setBook(record);
      const saved = await getProgress(bookId);

      try {
        const handle = await openPdf(await record.file.arrayBuffer());
        if (cancelled) {
          void handle.destroy();
          return;
        }
        handleRef.current = handle;
        const pdf = handle.doc;
        docRef.current = pdf;
        setDoc(pdf);
        totalRef.current = pdf.numPages;
        setTotal(pdf.numPages);

        const restored =
          saved?.page && saved.page >= 1 ? Math.min(saved.page, pdf.numPages) : 1;
        pageRef.current = restored;
        setPage(restored);

        const entries = await readPdfOutline(pdf);
        if (!cancelled) {
          outlineRef.current = entries;
          setOutline(entries);
        }

        setLoading(false);
        void touchBook(bookId);
      } catch {
        if (!cancelled) {
          setError('PDF 打开失败，文件可能已损坏或有密码保护。');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      flush();
      void handleRef.current?.destroy();
      handleRef.current = null;
      docRef.current = null;
    };
  }, [bookId, flush]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setStageWidth(element.clientWidth);
      setStageHeight(element.clientHeight);
    });
    observer.observe(element);
    setStageWidth(element.clientWidth);
    setStageHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const pdf = docRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || !stageWidth) return;
    let cancelled = false;
    const target = page;

    (async () => {
      try {
        const proxy = await pdf.getPage(target);
        if (cancelled) return;

        const base = proxy.getViewport({ scale: 1 });
        const gutter = stageWidth < 640 ? 24 : 56;
        const fitWidth = Math.max(0.12, (stageWidth - gutter) / base.width);
        const fitPage = Math.min(
          fitWidth,
          Math.max(0.12, (stageHeight - gutter) / base.height),
        );
        const scale =
          zoom === 'page'
            ? fitPage
            : zoom === 'actual'
              ? Math.min(fitWidth, ACTUAL_SIZE_SCALE)
              : fitWidth;
        const viewport = proxy.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const context = canvas.getContext('2d');
        if (!context) return;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        renderTaskRef.current?.cancel();
        const task = proxy.render({
          canvas: null,
          canvasContext: context,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;

        await task.promise;
        if (!cancelled) proxy.cleanup();
      } catch {
        /* 翻页过快时会取消上一帧，属正常情况 */
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [doc, page, zoom, stageWidth, stageHeight]);

  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  const currentTitle = chapterTitleFor(page);
  const isBookmarked = bookmarks.some((item) => item.cfi === `page:${page}`);

  const toggleBookmark = useCallback(async () => {
    const current = pageRef.current;
    const cfi = `page:${current}`;
    const existing = bookmarks.find((item) => item.cfi === cfi);
    if (existing) {
      await deleteBookmark(existing.id);
      pushToast('已移除书签');
      return;
    }
    await addBookmark({
      id: uid(),
      bookId,
      cfi,
      chapterTitle: chapterTitleFor(current),
      excerpt: `第 ${current} 页`,
      createdAt: Date.now(),
      percent: totalRef.current > 0 ? current / totalRef.current : undefined,
      chapterIndex: current - 1,
    });
    pushToast('已添加书签');
  }, [bookId, bookmarks, chapterTitleFor, pushToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          advance(1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          advance(-1);
          break;
        case 'Escape':
          setPanel(null);
          setOverlay(false);
          break;
        case 'm':
        case 'M':
          setOverlay(true);
          setPanel((value) => (value === 'toc' ? null : 'toc'));
          break;
        case 'b':
        case 'B':
          void toggleBookmark();
          break;
        case 't':
        case 'T': {
          const index = THEME_ORDER.indexOf(settings.theme);
          updateSettings({ theme: THEME_ORDER[(index + 1) % THEME_ORDER.length] });
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advance, goToPage, settings.theme, toggleBookmark, updateSettings]);

  const displayPage = scrub ?? page;
  const displayPercent = total ? displayPage / total : 0;
  const filter =
    settings.theme === 'night'
      ? 'invert(1) hue-rotate(180deg) brightness(0.92)'
      : settings.theme === 'sepia'
        ? 'sepia(0.2) brightness(0.99)'
        : undefined;

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
    if (ratio < 0.3) advance(-1);
    else if (ratio > 0.7) advance(1);
    else setOverlay((value) => !value);
  };

  if (error) {
    return (
      <div className="reader" data-theme={settings.theme}>
        <div className="reader-error">
          <div>
            <h1>打不开这个 PDF</h1>
            <p>{error}</p>
            <button type="button" className="btn btn-primary" onClick={() => (window.location.hash = '#/')}>
              返回书架
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reader pdf-reader" data-theme={settings.theme}>
      <div
        className="pdf-stage"
        ref={stageRef}
        onClick={handleStageClick}
      >
        <div className="pdf-page">
          <canvas ref={canvasRef} style={{ filter }} />
        </div>
      </div>

      {loading && <div className="reader-loading">正在打开 PDF</div>}

      {overlay && !loading && (
        <div className="reader-overlay" onClick={() => setOverlay(false)}>
          <div className="reader-top" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="icon-btn"
              aria-label="返回书架"
              onClick={() => {
                window.location.hash = '#/';
              }}
            >
              <ArrowLeft size={17} />
            </button>
            <div className="reader-title">
              <div className="t">{book?.title ?? ''}</div>
              <div className="s">
                第 {page} / {total} 页
              </div>
            </div>
            <button
              type="button"
              className={cx('icon-btn', isBookmarked && 'is-active')}
              aria-label={isBookmarked ? '移除书签' : '添加书签'}
              onClick={() => void toggleBookmark()}
            >
              <BookmarkIcon size={16} filled={isBookmarked} />
            </button>
          </div>

          <div className="reader-bottom" onClick={(event) => event.stopPropagation()}>
            <div className="progress-row">
              <button
                type="button"
                className="page-arrow"
                aria-label="上一页"
                onClick={() => advance(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                className="slider"
                type="range"
                min={1}
                max={Math.max(1, total)}
                step={1}
                value={displayPage}
                style={{ ['--progress' as string]: `${displayPercent * 100}%` }}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  scrubRef.current = value;
                  setScrub(value);
                }}
                onPointerUp={() => {
                  const target = scrubRef.current;
                  scrubRef.current = null;
                  if (target !== null) goToPage(target);
                }}
                onKeyUp={() => {
                  const target = scrubRef.current;
                  scrubRef.current = null;
                  if (target !== null) goToPage(target);
                }}
                onBlur={() => setScrub(null)}
                aria-label="页码"
              />
              <button
                type="button"
                className="page-arrow"
                aria-label="下一页"
                onClick={() => advance(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="progress-meta">
              <span className="pct">
                第 {displayPage} 页 · {formatPercent(displayPercent)}
              </span>
              <span>{currentTitle}</span>
            </div>

            <div className="toolbar">
              <button
                type="button"
                className={cx('tool', panel === 'toc' && 'is-active')}
                onClick={() => setPanel('toc')}
              >
                <ListIcon size={18} />
                目录
              </button>
              <button
                type="button"
                className={cx('tool', panel === 'bookmarks' && 'is-active')}
                onClick={() => setPanel('bookmarks')}
              >
                <BookmarkIcon size={18} />
                书签
              </button>
              <button
                type="button"
                className={cx('tool', panel === 'settings' && 'is-active')}
                onClick={() => setPanel('settings')}
              >
                <TypeIcon size={18} />
                显示
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === 'toc' && (
        <>
          <div className="drawer-veil" onClick={() => setPanel(null)} />
          <aside className="drawer" role="dialog" aria-label="目录">
            <div className="drawer-head">
              <span>目录</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPanel(null)}
                aria-label="关闭目录"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="drawer-body">
              {outline.length === 0 ? (
                <div className="panel-empty">这份 PDF 没有提供书签目录。</div>
              ) : (
                outline.map((entry, index) => (
                  <button
                    type="button"
                    key={`${entry.page}-${index}`}
                    className={cx('toc-item', 'pdf-toc', chapterTitleFor(page) === entry.label && 'is-current')}
                    style={{ paddingLeft: 18 + entry.depth * 14 }}
                    onClick={() => {
                      setPanel(null);
                      setOverlay(false);
                      goToPage(entry.page);
                    }}
                  >
                    <span>{entry.label}</span>
                    <em>{entry.page}</em>
                  </button>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {panel === 'settings' && (
        <PdfSettingsSheet
          settings={settings}
          zoom={zoom}
          update={updateSettings}
          onZoom={(value) => updateSettings({ pdfZoom: value })}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'bookmarks' && (
        <BookmarksSheet
          items={bookmarks}
          onSelect={(cfi) => {
            const target = Number(cfi.replace('page:', ''));
            setPanel(null);
            setOverlay(false);
            if (Number.isFinite(target)) goToPage(target);
          }}
          onDelete={(item) => {
            void deleteBookmark(item.id).then(() => {
              pushToast('书签已删除', {
                actionLabel: '撤销',
                onAction: () => {
                  void addBookmark(item);
                },
              });
            });
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

function PdfSettingsSheet({
  settings,
  zoom,
  update,
  onZoom,
  onClose,
}: {
  settings: ReaderSettings;
  zoom: ZoomMode;
  update: (patch: Partial<ReaderSettings>) => void;
  onZoom: (value: ZoomMode) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="veil" onClick={onClose} />
      <div className="sheet-wrap" onClick={onClose}>
        <div className="sheet" role="dialog" aria-label="显示设置" onClick={(event) => event.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="sheet-head">
            <span className="sheet-title">显示</span>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭显示设置">
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
            <span className="row-label">缩放</span>
            <div className="segmented">
              {ZOOM_STEPS.map((step) => (
                <button
                  type="button"
                  key={step.value}
                  className={cx(zoom === step.value && 'is-on')}
                  onClick={() => onZoom(step.value)}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>

          <p className="sheet-note">
            PDF 是固定版式，字号与行距由文件决定。夜间模式会对页面做反色处理，扫描件的照片颜色也会随之反转。
          </p>
        </div>
      </div>
    </>
  );
}
