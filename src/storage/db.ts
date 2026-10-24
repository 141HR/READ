import Dexie, { type Table } from 'dexie';
import type { BookmarkRecord, BookRecord, ProgressRecord, SourceRecord } from '../types';

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class ReadDatabase extends Dexie {
  books!: Table<BookRecord, string>;
  progress!: Table<ProgressRecord, string>;
  bookmarks!: Table<BookmarkRecord, string>;
  settings!: Table<SettingRecord, string>;
  sources!: Table<SourceRecord, string>;

  constructor() {
    super('read-db');
    this.version(1).stores({
      books: 'id, addedAt, lastOpenedAt, status',
      progress: 'bookId, updatedAt',
      bookmarks: 'id, bookId, createdAt',
      settings: 'key',
    });
    // v2 只新增书源表，已有书架 / 进度 / 书签无需迁移
    this.version(2).stores({
      sources: 'id, name, url, createdAt',
    });
  }
}

export const db = new ReadDatabase();
