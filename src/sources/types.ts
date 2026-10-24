import type { BookRecord } from '../types';

/** Legado / 阅读的 ruleSearch、ruleBookInfo、ruleToc、ruleContent 结构 */
export type SourceRuleSet = Record<string, string | undefined>;

export interface LegadoSource {
  bookSourceName?: string;
  bookSourceUrl?: string;
  bookSourceGroup?: string;
  bookSourceComment?: string;
  bookSourceType?: number;
  enabled?: boolean;
  searchUrl?: string;
  header?: string;
  ruleSearch?: SourceRuleSet;
  ruleBookInfo?: SourceRuleSet;
  ruleToc?: SourceRuleSet;
  ruleContent?: SourceRuleSet;
  /** 兼容早期书源字段命名 */
  searchRule?: SourceRuleSet;
  bookInfoRule?: SourceRuleSet;
  tocRule?: SourceRuleSet;
  contentRule?: SourceRuleSet;
  [key: string]: unknown;
}

export interface SourceSearchResult {
  sourceId: string;
  sourceName: string;
  name: string;
  author: string;
  bookUrl: string;
  coverUrl?: string;
  intro?: string;
  lastChapter?: string;
}

export interface SourceChapter {
  title: string;
  url: string;
}

export interface SourceToc {
  title: string;
  author: string;
  intro?: string;
  coverUrl?: string;
  chapters: SourceChapter[];
}

export interface SourceDownloadProgress {
  stage: 'toc' | 'chapter';
  current: number;
  total: number;
  title: string;
}

export type SourceDownloadResult =
  | { status: 'added'; book: BookRecord }
  | { status: 'duplicate' }
  | { status: 'error'; message: string };
