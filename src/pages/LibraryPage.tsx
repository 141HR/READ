import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../storage/db';
import { deleteBook, updateBookTitle } from '../storage/repository';
import { importBook } from '../lib/importBook';
import { isSupportedFile } from '../platform/fileSource';
import { acceptAttribute, formatLabel } from '../formats/detect';
import { formatRelativeDay } from '../lib/utils';
import type { BookRecord } from '../types';
import { BookCover } from '../components/BookCover';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ChevronRight, MoreVertical, UploadIcon } from '../components/Icons';
import { useToastStore } from '../state/toast';

export function LibraryPage() {
  const books = useLiveQuery(() => db.books.toArray(), []);
  const progressList = useLiveQuery(() => db.progress.toArray(), []);
  const loading = books === undefined || progressList === undefined;
  const pushToast = useToastStore((state) => state.push);

  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [importing, setImporting] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BookRecord | null>(null);
  const [pendingRename, setPendingRename] = useState<BookRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menuBookId, setMenuBookId] = useState<string | null>(null);

  // Android 返回键：菜单 → 重命名 → 删除确认，逐层关闭
  useEffect(() => {
    if (!pendingDelete && !pendingRename && !menuBookId) return;
    const onBack = (event: Event) => {
      event.preventDefault();
      if (pendingDelete) {
        setPendingDelete(null);
      } else if (pendingRename) {
        setPendingRename(null);
      } else {
        setMenuBookId(null);
      }
    };
    window.addEventListener('read:back', onBack);
    return () => window.removeEventListener('read:back', onBack);
  }, [pendingDelete, pendingRename, menuBookId]);

  // 点空白处或 Escape 收起书籍菜单
  useEffect(() => {
    if (!menuBookId) return;
    const close = () => setMenuBookId(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuBookId]);

  const sorted = useMemo(
    () =>
      [...(books ?? [])].sort(
        (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt,
      ),
    [books],
  );

  const progressMap = useMemo(
    () => new Map((progressList ?? []).map((record) => [record.bookId, record])),
    [progressList],
  );

  const continueBook = loading
    ? undefined
    : sorted.find((book) => book.status === 'reading' && progressMap.has(book.id));

  const openBook = (id: string) => {
    window.location.hash = `#/read/${id}`;
  };

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (importing) return;
      const supported = files.filter(isSupportedFile);
      if (supported.length === 0) {
        pushToast('目前支持 EPUB、PDF 与 TXT', { tone: 'error' });
        return;
      }
      if (supported.length < files.length) {
        pushToast('已忽略不支持的文件');
      }

      for (const file of supported) {
        setImporting(file.name);
        try {
          const result = await importBook(file);
          if (result.status === 'added') {
            pushToast(`《${result.book.title}》已加入书架`);
          } else if (result.status === 'duplicate') {
            pushToast(`${file.name} 已在书架里`);
          } else {
            pushToast(result.message, { tone: 'error' });
          }
        } catch (error) {
          // 读文件或写 IndexedDB 都可能失败，不能把导入提示永远卡在界面上
          const reason = error instanceof Error ? error.message : '未知错误';
          pushToast(`${file.name} 导入失败：${reason}`, { tone: 'error' });
        }
      }
      setImporting(null);
    },
    [importing, pushToast],
  );

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) void handleFiles(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  const beginRename = (book: BookRecord) => {
    setMenuBookId(null);
    setPendingRename(book);
    setRenameValue(book.title);
  };

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingRename) return;
    const title = renameValue.trim();
    if (!title) return;
    if (title === pendingRename.title) {
      setPendingRename(null);
      return;
    }
    try {
      await updateBookTitle(pendingRename.id, title);
      setPendingRename(null);
      pushToast('书名已更新');
    } catch {
      pushToast('重命名失败，请重试', { tone: 'error' });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id, title } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteBook(id);
      pushToast(`已移除《${title}》`);
    } catch {
      pushToast(`《${title}》移除失败，请重试`, { tone: 'error' });
    }
  };

  const continueProgress = continueBook ? progressMap.get(continueBook.id) : undefined;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">READ</div>
      </header>

      <main className="shell">
        <input
          ref={fileRef}
          type="file"
          accept={acceptAttribute()}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length > 0) void handleFiles(files);
          }}
        />

        {continueBook && continueProgress && (
          <button type="button" className="continue" onClick={() => openBook(continueBook.id)}>
            <div className="continue-cover">
              {continueBook.cover ? (
                <img src={continueBook.cover} alt="" />
              ) : (
                <div className="continue-fallback">{continueBook.title.slice(0, 1)}</div>
              )}
            </div>
            <div className="continue-body">
              <div className="eyebrow">继续阅读</div>
              <div className="continue-title">{continueBook.title}</div>
              <div className="continue-meta">
                {continueProgress.chapterTitle} · {Math.floor(continueProgress.percent * 100)}% ·{' '}
                {formatRelativeDay(continueProgress.updatedAt)}
              </div>
              <div className="continue-bar">
                <span style={{ width: `${Math.max(2, continueProgress.percent * 100)}%` }} />
              </div>
            </div>
            <ChevronRight size={18} />
          </button>
        )}

        {loading ? (
          <section className="shelf" aria-busy="true" aria-label="正在读取书架">
            <div className="shelf-head">
              <span className="shelf-label">书架</span>
              <span className="shelf-count">读取中…</span>
            </div>
            <div className="books">
              {[0, 1, 2, 3].map((index) => (
                <div className="book-skeleton" key={index} aria-hidden="true">
                  <div className="cover-skeleton" />
                  <div className="line-skeleton" />
                  <div className="line-skeleton is-short" />
                </div>
              ))}
            </div>
          </section>
        ) : sorted.length === 0 ? (
          <section className="empty">
            <h1>
              书架还是空的，
              <br />
              先放一本进来。
            </h1>
          </section>
        ) : (
          <section className="shelf">
            <div className="shelf-head">
              <span className="shelf-label">书架</span>
              <span className="shelf-count">{sorted.length} 本</span>
            </div>
            <div className="books">
              {sorted.map((book) => {
                const progress = progressMap.get(book.id);
                const percent = progress ? Math.min(100, Math.floor(progress.percent * 100)) : 0;
                return (
                  <div className="book" key={book.id}>
                    <div
                      className="book-main"
                      role="button"
                      tabIndex={0}
                      aria-label={`阅读 ${book.title}`}
                      onClick={() => openBook(book.id)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openBook(book.id);
                        }
                      }}
                    >
                      <div className="book-cover-wrap">
                        <BookCover title={book.title} cover={book.cover}>
                          {book.format !== 'epub' && (
                            <span className="book-badge">{formatLabel(book.format)}</span>
                          )}
                        </BookCover>
                        <button
                          type="button"
                          className="book-menu-trigger"
                          aria-label={`更多操作：${book.title}`}
                          aria-haspopup="menu"
                          aria-expanded={menuBookId === book.id}
                          onPointerDown={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuBookId((current) => (current === book.id ? null : book.id));
                          }}
                        >
                          <MoreVertical size={15} />
                        </button>
                        {menuBookId === book.id && (
                          <div
                            className="book-menu"
                            role="menu"
                            onPointerDown={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button type="button" role="menuitem" onClick={() => beginRename(book)}>
                              重命名
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="is-danger"
                              onClick={() => {
                                setMenuBookId(null);
                                setPendingDelete(book);
                              }}
                            >
                              删除书籍
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="book-title">{book.title}</div>
                      <div className="book-author">{book.author}</div>
                      {percent > 0 && (
                        <>
                          <div className="book-progress">
                            <span style={{ width: `${percent}%` }} />
                          </div>
                          <div className="book-flag">
                            {book.status === 'finished' ? '已读完' : `${percent}%`}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <button
        type="button"
        className="btn btn-primary import-fab"
        onClick={() => fileRef.current?.click()}
        aria-label="导入书籍"
      >
        <UploadIcon size={15} />
        导入书籍
      </button>

      {dragging && (
        <div className="drop-veil">
          <div className="drop-card">
            <strong>松手，放进书架</strong>
            <span>支持 EPUB / PDF / TXT</span>
          </div>
        </div>
      )}

      {importing && (
        <div className="import-pill">
          <span className="spinner" />
          <span>
            正在解析 <em>{importing}</em>
          </span>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`移除《${pendingDelete?.title ?? ''}》？`}
        description="会同时删除这本书的阅读进度与书签。原文件不会被修改，之后仍可重新导入。"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />

      {pendingRename && (
        <div
          className="modal-wrap"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-title"
          onClick={() => setPendingRename(null)}
        >
          <form className="modal" onClick={(event) => event.stopPropagation()} onSubmit={submitRename}>
            <h3 id="rename-title">重命名</h3>
            <input
              className="modal-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              aria-label="书名"
              maxLength={120}
              autoFocus
              spellCheck={false}
            />
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPendingRename(null)}>
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={!renameValue.trim()}>
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
