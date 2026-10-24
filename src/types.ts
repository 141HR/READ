export type BookStatus = 'unread' | 'reading' | 'finished';

export type BookFormat = 'epub' | 'pdf' | 'txt';

export type ThemeName = 'day' | 'sepia' | 'night';

export type FontFamily = 'serif' | 'sans';

/** auto：桌面默认实际大小、窄屏默认适宽；用户手动选过之后按具体值保存 */
export type PdfZoom = 'auto' | 'page' | 'actual' | 'width';

export interface BookTocEntry {
  label: string;
  href: string;
  depth: number;
}

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  cover?: string;
  fileName: string;
  fileSize: number;
  format: BookFormat;
  chapterCount: number;
  totalChars: number;
  pageCount?: number;
  addedAt: number;
  lastOpenedAt?: number;
  status: BookStatus;
  file: Blob;
  locations?: string;
  chapterChars?: number[];
  toc?: BookTocEntry[];
  /** 从书源下载的书才有这些字段；后续可用于「检查更新」 */
  sourceId?: string;
  sourceName?: string;
  sourceBookUrl?: string;
}

export interface SourceRecord {
  id: string;
  name: string;
  url: string;
  group: string;
  enabled: boolean;
  /** 原始 Legado 书源 JSON，便于再次解析和导出 */
  json: string;
  createdAt: number;
}

export interface ProgressRecord {
  bookId: string;
  cfi: string;
  chapterHref: string;
  chapterTitle: string;
  chapterIndex: number;
  percent: number;
  page?: number;
  updatedAt: number;
}

export interface BookmarkRecord {
  id: string;
  bookId: string;
  cfi: string;
  chapterTitle: string;
  excerpt: string;
  createdAt: number;
  /** 全书位置（0–1），用于书签按阅读位置排序；老数据没有 */
  percent?: number;
  /** 章节序号（EPUB 按 spine，PDF 为页号 - 1）；老数据没有 */
  chapterIndex?: number;
}

export interface ReaderSettings {
  theme: ThemeName;
  fontSize: number;
  lineHeight: number;
  margin: number;
  fontFamily: FontFamily;
  pdfZoom: PdfZoom;
}

export const FONT_SIZE_STEPS = [14, 16, 18, 20, 22];
export const LINE_HEIGHT_STEPS = [1.4, 1.6, 1.8, 2.0];
export const MARGIN_STEPS = [20, 36, 56];

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'day',
  fontSize: 18,
  lineHeight: 1.8,
  margin: 36,
  fontFamily: 'serif',
  pdfZoom: 'auto',
};

export interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'error';
}
