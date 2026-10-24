import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../storage/db';
import {
  addBookmark,
  deleteBookmark,
  getBook,
  getProgress,
  saveProgress,
  touchBook,
} from '../storage/repository';
import { EpubJsEngine } from '../engine/EpubJsEngine';
import type { ReaderLocation, TocEntry } from '../engine/ReaderEngine';
import type { BookmarkRecord, BookRecord, ThemeName } from '../types';
import { FONT_SIZE_STEPS } from '../types';
import { useSettingsStore } from '../state/settings';
import { useToastStore } from '../state/toast';
import { basename, formatPercent, formatRemaining, sortBookmarks, uid } from '../lib/utils';
import { ArrowLeft, BookmarkIcon, ChevronLeft, ChevronRight, ListIcon, TypeIcon } from '../components/Icons';
import { BookmarksSheet, SettingsSheet, TocDrawer } from '../components/ReaderPanels';
import { cx } from '../lib/utils';

type Panel = 'toc' | 'settings' | 'bookmarks' | null;

const THEME_ORDER: ThemeName[] = ['day', 'sepia', 'night'];

function useCompactLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 680px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 680px)');
    const handler = () => setCompact(query.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);
  return compact;
}

export function EpubReaderPage({ bookId }: { bookId: string }) {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);
  const pushToast = useToastStore((state) => state.push);

  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EpubJsEngine | null>(null);
  const locationRef = useRef<ReaderLocation | null>(null);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const settingsRef = useRef(settings);
  const scrubRef = useRef<number | null>(null);
  const suppressCloseRef = useRef(0);
  const saveErrorRef = useRef(false);

  const [book, setBook] = useState<BookRecord | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [canBack, setCanBack] = useState(false);

  const compact = useCompactLayout();

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

  const bookmarkRecords =
    useLiveQuery(() => db.bookmarks.where('bookId').equals(bookId).toArray(), [bookId], []) ?? [];
  const bookmarks = useMemo(() => sortBookmarks(bookmarkRecords), [bookmarkRecords]);

  const reportSaveError = useCallback(() => {
    if (saveErrorRef.current) return;
    saveErrorRef.current = true;
    pushToast('进度保存失败，本次阅读仍可继续', { tone: 'error' });
  }, [pushToast]);

  const flushNow = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    const current = locationRef.current;
    if (!current) return;
    void saveProgress({
      bookId,
      cfi: current.cfi,
      chapterHref: current.chapterHref,
      chapterTitle: current.chapterTitle,
      chapterIndex: current.chapterIndex,
      percent: current.percent,
      updatedAt: Date.now(),
    }).catch(reportSaveError);
  }, [bookId, reportSaveError]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushNow, 700);
  }, [flushNow]);

  const handleTap = useCallback((ratio: number) => {
    if (ratio < 0.3) {
      void engineRef.current?.prev();
    } else if (ratio > 0.7) {
      void engineRef.current?.next();
    } else {
      suppressCloseRef.current = Date.now() + 420;
      // 同页脚注跳转不一定触发 relocated，打开控制层时直接从引擎取一次返回栈状态
      setCanBack(engineRef.current?.canGoBack() ?? false);
      setOverlay((value) => !value);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    engineRef.current?.destroy();
    engineRef.current = null;
    locationRef.current = null;
    setLoading(true);
    setError(null);
    setLocation(null);
    setOverlay(false);
    setPanel(null);

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

      const engine = new EpubJsEngine();
      engine.setSettings(settingsRef.current);
      try {
        await engine.open(await record.file.arrayBuffer(), {
          locations: record.locations,
          chapterChars: record.chapterChars,
          toc: record.toc,
        });
      } catch {
        engine.destroy();
        if (!cancelled) {
          setError('文件解析失败，可能已损坏、加密，或不是标准的 EPUB。');
          setLoading(false);
        }
        return;
      }

      if (cancelled) {
        engine.destroy();
        return;
      }

      engineRef.current = engine;
      engine.onRelocated((next) => {
        locationRef.current = next;
        setLocation(next);
        setCanBack(engine.canGoBack());
        scheduleSave();
      });
      engine.onTap(handleTap);

      if (hostRef.current) {
        engine.mount(hostRef.current);
      }
      setToc(engine.toc());

      try {
        await engine.display(saved?.cfi ?? engine.firstHref());
      } catch {
        await engine.display();
      }
      if (cancelled) return;

      setLoading(false);
      void touchBook(bookId);

      const hintKey = 'read:hint-shown';
      if (!window.localStorage.getItem(hintKey)) {
        window.localStorage.setItem(hintKey, '1');
        window.setTimeout(() => pushToast('点屏幕中间调出菜单，左右区域翻页'), 800);
      }
    })();

    return () => {
      cancelled = true;
      flushNow();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [bookId, flushNow, handleTap, pushToast, scheduleSave]);

  useEffect(() => {
    settingsRef.current = settings;
    const engine = engineRef.current;
    if (!engine) return;
    const cfi = locationRef.current?.cfi;
    engine.setSettings(settings);
    if (!cfi) return;
    const timer = window.setTimeout(() => {
      void engine.display(cfi);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    const onHide = () => flushNow();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushNow]);

  const toggleBookmark = useCallback(async () => {
    const current = locationRef.current;
    if (!current) return;
    const existing = bookmarks.find((item) => item.cfi === current.cfi);
    if (existing) {
      await deleteBookmark(existing.id);
      pushToast('已移除书签');
      return;
    }
    const excerpt = engineRef.current?.excerpt() ?? '';
    await addBookmark({
      id: uid(),
      bookId,
      cfi: current.cfi,
      chapterTitle: current.chapterTitle,
      excerpt,
      createdAt: Date.now(),
      percent: current.percent,
      chapterIndex: current.chapterIndex,
    });
    pushToast('已添加书签');
  }, [bookId, bookmarks, pushToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const engine = engineRef.current;
      if (!engine) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          void engine.next();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          void engine.prev();
          break;
        case 'Escape':
          setPanel(null);
          setOverlay(false);
          break;
        case 'm':
        case 'M':
          setCanBack(engineRef.current?.canGoBack() ?? false);
          setOverlay(true);
          setPanel((value) => (value === 'toc' ? null : 'toc'));
          break;
        case 'b':
        case 'B':
          void toggleBookmark();
          break;
        case 't':
        case 'T': {
          const index = THEME_ORDER.indexOf(settingsRef.current.theme);
          updateSettings({ theme: THEME_ORDER[(index + 1) % THEME_ORDER.length] });
          break;
        }
        case '+':
        case '=': {
          const index = FONT_SIZE_STEPS.indexOf(settingsRef.current.fontSize);
          updateSettings({ fontSize: FONT_SIZE_STEPS[Math.min(FONT_SIZE_STEPS.length - 1, index + 1)] });
          break;
        }
        case '-': {
          const index = FONT_SIZE_STEPS.indexOf(settingsRef.current.fontSize);
          updateSettings({ fontSize: FONT_SIZE_STEPS[Math.max(0, index - 1)] });
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleBookmark, updateSettings]);

  const isBookmarked = useMemo(
    () => Boolean(location && bookmarks.some((item) => item.cfi === location.cfi)),
    [bookmarks, location],
  );

  const currentTocIndex = useMemo(() => {
    if (!location) return -1;
    const current = basename(location.chapterHref);
    return toc.findIndex((entry) => basename(entry.href) === current);
  }, [location, toc]);

  const goChapter = (index: number) => {
    const target = toc[index];
    if (!target) return;
    setPanel(null);
    setOverlay(false);
    void engineRef.current?.goToHref(target.href);
  };

  const displayPercent = scrub ?? location?.percent ?? 0;
  const remainingSeconds = book ? ((book.totalChars * (1 - displayPercent)) / 400) * 60 : 0;

  const horizontalPadding = compact ? Math.round(settings.margin * 0.66) : settings.margin;
  const verticalPadding = compact ? 22 : 26;

  const commitScrub = () => {
    const target = scrubRef.current;
    scrubRef.current = null;
    if (target === null) return;
    setScrub(null);
    void engineRef.current?.goToPercent(target);
  };

  if (error) {
    return (
      <div className="reader" data-theme={settings.theme}>
        <div className="reader-error">
          <div>
            <h1>打不开这本书</h1>
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
    <div className="reader" data-theme={settings.theme}>
      <div
        className="reader-stage"
        style={{ padding: `${verticalPadding}px ${horizontalPadding}px` }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const ratio = (event.clientX - event.currentTarget.getBoundingClientRect().left) /
            Math.max(1, event.currentTarget.clientWidth);
          handleTap(ratio);
        }}
      >
        <div className="reader-mount" ref={hostRef} />
      </div>

      {loading && <div className="reader-loading">正在排版</div>}

      {overlay && !loading && (
        <div
          className="reader-overlay"
          onClick={() => {
            if (Date.now() < suppressCloseRef.current) return;
            setOverlay(false);
          }}
        >
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
              <div className="s">{location?.chapterTitle ?? ''}</div>
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
            {canBack && (
              <button
                type="button"
                className="back-chip"
                onClick={() => {
                  void engineRef.current?.goBack().then(() => {
                    setCanBack(engineRef.current?.canGoBack() ?? false);
                    setOverlay(false);
                  });
                }}
              >
                <ArrowLeft size={12} /> 返回上一处
              </button>
            )}

            <div className="progress-row">
              <button
                type="button"
                className="page-arrow"
                aria-label="上一页"
                onClick={() => void engineRef.current?.prev()}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                className="slider"
                type="range"
                min={0}
                max={1000}
                step={1}
                value={Math.round(displayPercent * 1000)}
                style={{ ['--progress' as string]: `${displayPercent * 100}%` }}
                onChange={(event) => {
                  const value = Number(event.target.value) / 1000;
                  scrubRef.current = value;
                  setScrub(value);
                }}
                onPointerUp={commitScrub}
                onTouchEnd={commitScrub}
                onKeyUp={commitScrub}
                onBlur={commitScrub}
                aria-label="阅读进度"
              />
              <button
                type="button"
                className="page-arrow"
                aria-label="下一页"
                onClick={() => void engineRef.current?.next()}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="progress-meta">
              <span className="pct">{formatPercent(displayPercent)}</span>
              <span>{formatRemaining(remainingSeconds)}</span>
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
                排版
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === 'toc' && (
        <TocDrawer
          toc={toc}
          currentHref={location?.chapterHref ?? ''}
          canPrev={currentTocIndex > 0}
          canNext={currentTocIndex >= 0 && currentTocIndex < toc.length - 1}
          onSelect={(href) => {
            setPanel(null);
            setOverlay(false);
            void engineRef.current?.goToHref(href);
          }}
          onPrev={() => goChapter(currentTocIndex - 1)}
          onNext={() => goChapter(currentTocIndex + 1)}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'settings' && (
        <SettingsSheet settings={settings} update={updateSettings} onClose={() => setPanel(null)} />
      )}

      {panel === 'bookmarks' && (
        <BookmarksSheet
          items={bookmarks}
          onSelect={(cfi) => {
            setPanel(null);
            setOverlay(false);
            void engineRef.current?.display(cfi);
          }}
          onDelete={(item: BookmarkRecord) => {
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
