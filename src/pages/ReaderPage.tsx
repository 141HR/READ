import { lazy, Suspense, useEffect, useState } from 'react';
import { getBook } from '../storage/repository';
import type { BookFormat } from '../types';
import { useSettingsStore } from '../state/settings';
import { EpubReaderPage } from './EpubReaderPage';

const PdfReaderPage = lazy(() =>
  import('./PdfReaderPage').then((module) => ({ default: module.PdfReaderPage })),
);

export function ReaderPage({ bookId }: { bookId: string }) {
  const theme = useSettingsStore((state) => state.settings.theme);
  const [format, setFormat] = useState<BookFormat | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setFormat(null);
    setMissing(false);

    void getBook(bookId).then((book) => {
      if (!alive) return;
      if (!book) {
        setMissing(true);
      } else {
        setFormat(book.format);
      }
    });

    return () => {
      alive = false;
    };
  }, [bookId]);

  if (missing) {
    return (
      <div className="reader" data-theme={theme}>
        <div className="reader-error">
          <div>
            <h1>找不到这本书</h1>
            <p>它可能已经被移出书架。</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                window.location.hash = '#/';
              }}
            >
              返回书架
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!format) return <div className="boot" />;

  return format === 'pdf' ? (
    <Suspense fallback={<div className="boot" />}>
      <PdfReaderPage key={bookId} bookId={bookId} />
    </Suspense>
  ) : (
    <EpubReaderPage key={bookId} bookId={bookId} />
  );
}
