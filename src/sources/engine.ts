import type { BookRecord, BookTocEntry, SourceRecord } from '../types';
import { addBook, getBook } from '../storage/repository';
import { sha256Text, trimBookTitle } from '../lib/utils';
import { fetchSourceText } from './http';
import { loadSource } from './import';
import {
  applyUrlTemplate,
  htmlToText,
  parseHeaders,
  parseRule,
  resolveUrl,
  rulesOf,
  selectRuleElements,
} from './rules';
import type {
  LegadoSource,
  SourceChapter,
  SourceDownloadProgress,
  SourceDownloadResult,
  SourceSearchResult,
  SourceToc,
} from './types';

interface SourceDownloadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: SourceDownloadProgress) => void;
}

function parseRecord(record: SourceRecord): LegadoSource {
  const source = loadSource(record.json);
  if (!source.bookSourceUrl) throw new Error('书源缺少 bookSourceUrl');
  return source;
}

function searchUrl(source: LegadoSource, keyword: string): string {
  if (!source.searchUrl) throw new Error('书源没有 searchUrl');
  const url = applyUrlTemplate(source.searchUrl, {
    key: encodeURIComponent(keyword),
    searchKey: encodeURIComponent(keyword),
    page: '1',
  });
  return resolveUrl(source.bookSourceUrl ?? '', url);
}

async function fetchDocument(
  url: string,
  source: LegadoSource,
  signal?: AbortSignal,
): Promise<Document> {
  const html = await fetchSourceText(url, {
    headers: parseHeaders(source.header),
    signal,
  });
  return new DOMParser().parseFromString(html, 'text/html');
}

function field(root: Document | Element, rule: string | undefined, baseUrl: string): string {
  return parseRule(root, rule, baseUrl);
}

function optional(value: string): string | undefined {
  return value || undefined;
}

export async function searchSource(
  record: SourceRecord,
  keyword: string,
  signal?: AbortSignal,
): Promise<SourceSearchResult[]> {
  const source = parseRecord(record);
  const rules = rulesOf(source, 'search');
  if (!rules.bookList || !rules.name || !rules.bookUrl) {
    throw new Error('书源缺少搜索规则');
  }

  const url = searchUrl(source, keyword);
  const doc = await fetchDocument(url, source, signal);
  const items = selectRuleElements(doc, rules.bookList);
  const results: SourceSearchResult[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const name = field(item, rules.name, url);
    const bookUrl = field(item, rules.bookUrl, url);
    if (!name || !bookUrl || seen.has(bookUrl)) continue;
    seen.add(bookUrl);
    results.push({
      sourceId: record.id,
      sourceName: record.name,
      name,
      author: field(item, rules.author, url) || '佚名',
      bookUrl,
      coverUrl: optional(field(item, rules.coverUrl, url)),
      intro: optional(field(item, rules.intro, url)),
      lastChapter: optional(field(item, rules.lastChapter, url)),
    });
  }

  return results;
}

export async function searchAllSources(
  sources: SourceRecord[],
  keyword: string,
  signal?: AbortSignal,
): Promise<{ results: SourceSearchResult[]; errors: string[] }> {
  const enabled = sources.filter((source) => source.enabled);
  if (enabled.length === 0) throw new Error('没有启用的书源');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const settled = await Promise.allSettled(
    enabled.map((source) => searchSource(source, keyword, signal)),
  );
  const results: SourceSearchResult[] = [];
  const errors: string[] = [];

  settled.forEach((item, index) => {
    if (item.status === 'fulfilled') {
      results.push(...item.value);
    } else {
      const message = item.reason instanceof Error ? item.reason.message : '搜索失败';
      errors.push(`${enabled[index].name}：${message}`);
    }
  });

  return { results, errors };
}

export async function readSourceToc(
  record: SourceRecord,
  result: SourceSearchResult,
  signal?: AbortSignal,
): Promise<SourceToc> {
  const source = parseRecord(record);
  const info = rulesOf(source, 'info');
  const detailDoc = await fetchDocument(result.bookUrl, source, signal);

  const title =
    trimBookTitle(field(detailDoc, info.name, result.bookUrl)) ||
    trimBookTitle(result.name) ||
    '未命名书籍';
  const author = field(detailDoc, info.author, result.bookUrl) || result.author || '佚名';
  const intro = optional(field(detailDoc, info.intro, result.bookUrl)) ?? result.intro;
  const coverUrl =
    optional(field(detailDoc, info.coverUrl, result.bookUrl)) ?? result.coverUrl;

  const tocLink = field(detailDoc, info.tocUrl, result.bookUrl);
  const tocUrl = tocLink ? resolveUrl(result.bookUrl, tocLink) : result.bookUrl;
  const tocDoc =
    tocUrl === result.bookUrl ? detailDoc : await fetchDocument(tocUrl, source, signal);

  const toc = rulesOf(source, 'toc');
  if (!toc.chapterList || !toc.chapterName || !toc.chapterUrl) {
    throw new Error('书源缺少目录规则');
  }

  const chapters: SourceChapter[] = [];
  const seen = new Set<string>();
  for (const item of selectRuleElements(tocDoc, toc.chapterList)) {
    const chapterTitle = field(item, toc.chapterName, tocUrl).split('\n')[0]?.trim() ?? '';
    const chapterUrl = field(item, toc.chapterUrl, tocUrl);
    if (!chapterTitle || !chapterUrl || seen.has(chapterUrl)) continue;
    seen.add(chapterUrl);
    chapters.push({ title: chapterTitle, url: chapterUrl });
  }

  if (chapters.length === 0) throw new Error('没有解析到目录，请检查 tocRule');
  return { title, author, intro, coverUrl, chapters };
}

async function readChapter(
  source: LegadoSource,
  chapterUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  const rules = rulesOf(source, 'content');
  if (!rules.content) throw new Error('书源缺少正文规则');

  const parts: string[] = [];
  const visited = new Set<string>();
  let url = chapterUrl;

  for (let page = 0; page < 6 && url && !visited.has(url); page += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    visited.add(url);
    const doc = await fetchDocument(url, source, signal);
    const raw = field(doc, rules.content, url);
    const text = htmlToText(raw);
    if (text) parts.push(text);
    if (!rules.nextContentUrl) break;
    const next = field(doc, rules.nextContentUrl, url);
    if (!next) break;
    url = resolveUrl(url, next);
  }

  return parts.join('\n\n').trim();
}

function safeFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '未命名书籍'}.epub`;
}

export async function downloadSourceBook(
  record: SourceRecord,
  result: SourceSearchResult,
  options: SourceDownloadOptions = {},
): Promise<SourceDownloadResult> {
  try {
    const source = parseRecord(record);
    const toc = await readSourceToc(record, result, options.signal);
    options.onProgress?.({
      stage: 'toc',
      current: 0,
      total: toc.chapters.length,
      title: toc.title,
    });

    const chapters: Array<{ title: string; body: string }> = [];
    for (let index = 0; index < toc.chapters.length; index += 1) {
      const chapter = toc.chapters[index];
      const body = await readChapter(source, chapter.url, options.signal);
      if (!body) throw new Error(`第 ${index + 1} 章没有抓到正文`);
      chapters.push({ title: chapter.title, body });
      options.onProgress?.({
        stage: 'chapter',
        current: index + 1,
        total: toc.chapters.length,
        title: chapter.title,
      });
    }

    const id = await sha256Text(`source:${record.id}:${result.bookUrl}`);
    const existing = await getBook(id);
    if (existing) return { status: 'duplicate' };

    const chapterChars = chapters.map((chapter) => chapter.body.replace(/\s/g, '').length);
    const totalChars = chapterChars.reduce((sum, value) => sum + value, 0);
    const bookToc: BookTocEntry[] = chapters.map((chapter, index) => ({
      label: chapter.title,
      href: `ch${index + 1}.xhtml`,
      depth: 0,
    }));

    const { buildTxtEpub } = await import('../formats/txt');
    const epub = await buildTxtEpub({
      title: toc.title,
      author: toc.author,
      encoding: 'source',
      chapters,
      charCount: totalChars,
    });
    const file = new Blob([epub], { type: 'application/epub+zip' });
    const book: BookRecord = {
      id,
      title: toc.title,
      author: toc.author,
      fileName: safeFileName(toc.title),
      fileSize: file.size,
      format: 'epub',
      chapterCount: chapters.length,
      totalChars,
      chapterChars,
      toc: bookToc,
      addedAt: Date.now(),
      status: 'unread',
      file,
      sourceId: record.id,
      sourceName: record.name,
      sourceBookUrl: result.bookUrl,
    };

    await addBook(book);
    return { status: 'added', book };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '书源下载失败',
    };
  }
}
