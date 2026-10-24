import {
  DEFAULT_SETTINGS,
  type BookmarkRecord,
  type BookRecord,
  type ProgressRecord,
  type ReaderSettings,
  type SourceRecord,
} from '../types';
import { db } from './db';

const SETTINGS_KEY = 'reader-settings';

export async function listBooks(): Promise<BookRecord[]> {
  const books = await db.books.toArray();
  return books.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt);
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  return db.books.get(id);
}

export async function addBook(book: BookRecord): Promise<void> {
  await db.books.put(book);
}

export async function updateBookTitle(id: string, title: string): Promise<void> {
  await db.books.update(id, { title });
}

export async function deleteBook(id: string): Promise<void> {
  await db.transaction('rw', db.books, db.progress, db.bookmarks, async () => {
    await db.books.delete(id);
    await db.progress.delete(id);
    await db.bookmarks.where('bookId').equals(id).delete();
  });
}

export async function touchBook(id: string): Promise<void> {
  await db.books.update(id, { lastOpenedAt: Date.now() });
}

export async function saveProgress(record: ProgressRecord): Promise<void> {
  await db.transaction('rw', db.progress, db.books, async () => {
    await db.progress.put(record);
    const book = await db.books.get(record.bookId);
    if (!book) return;
    // 只按进度判断，不能再看 book.status：已读完的书重新打开时还会继续保存进度，
    // 若排除 finished，这里会把状态写回 reading。进度掉回阈值以下时自然回到 reading。
    const finished = record.percent >= 0.995;
    await db.books.update(record.bookId, {
      lastOpenedAt: record.updatedAt,
      status: finished ? 'finished' : 'reading',
    });
  });
}

export async function getProgress(bookId: string): Promise<ProgressRecord | undefined> {
  return db.progress.get(bookId);
}

export async function listBookmarks(bookId: string): Promise<BookmarkRecord[]> {
  const items = await db.bookmarks.where('bookId').equals(bookId).toArray();
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addBookmark(record: BookmarkRecord): Promise<void> {
  await db.bookmarks.put(record);
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id);
}

export async function getSettings(): Promise<ReaderSettings> {
  const record = await db.settings.get(SETTINGS_KEY);
  if (!record || typeof record.value !== 'object' || record.value === null) {
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...(record.value as Partial<ReaderSettings>) };
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value: settings });
}

export async function listSources(): Promise<SourceRecord[]> {
  const sources = await db.sources.toArray();
  return sources.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getSource(id: string): Promise<SourceRecord | undefined> {
  return db.sources.get(id);
}

export async function addSource(source: SourceRecord): Promise<void> {
  await db.sources.put(source);
}

export async function updateSource(
  id: string,
  patch: Partial<Pick<SourceRecord, 'enabled'>>,
): Promise<void> {
  await db.sources.update(id, patch);
}

export async function deleteSource(id: string): Promise<void> {
  await db.sources.delete(id);
}

export async function clearAll(): Promise<void> {
  await db.transaction(
    'rw',
    db.books,
    db.progress,
    db.bookmarks,
    db.settings,
    db.sources,
    async () => {
      await db.books.clear();
      await db.progress.clear();
      await db.bookmarks.clear();
      await db.settings.clear();
      await db.sources.clear();
    },
  );
}
