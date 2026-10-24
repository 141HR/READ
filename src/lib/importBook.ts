import { EpubJsEngine } from '../engine/EpubJsEngine';
import { addBook, getBook } from '../storage/repository';
import type { BookRecord } from '../types';
import { detectFormat } from '../formats/detect';
import type { PdfHandle } from '../formats/pdf';
import { fileNameTitle, sha256Hex, trimBookTitle } from './utils';

export type ImportResult =
  | { status: 'added'; book: BookRecord }
  | { status: 'duplicate' }
  | { status: 'error'; message: string };

const MAX_SIZE = 200 * 1024 * 1024;
const MAX_TXT_SIZE = 30 * 1024 * 1024;

export async function importBook(file: File): Promise<ImportResult> {
  if (file.size > MAX_SIZE) {
    return { status: 'error', message: '文件超过 200MB，暂不支持导入' };
  }

  // 先读文件头判断格式：不支持的文件不必整本读进内存，更不必算 SHA-256
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const format = detectFormat(file.name, head);
  if (!format) {
    return { status: 'error', message: '目前支持 EPUB、PDF 与 TXT，其他格式暂不支持' };
  }
  if (format === 'txt' && file.size > MAX_TXT_SIZE) {
    return { status: 'error', message: 'TXT 超过 30MB，建议先分段或转成 EPUB' };
  }

  const buffer = await file.arrayBuffer();
  const id = await sha256Hex(buffer);
  const existing = await getBook(id);
  if (existing) {
    return { status: 'duplicate' };
  }

  if (format === 'pdf') {
    return importPdf(file, id, buffer);
  }
  if (format === 'txt') {
    return importTxt(file, id, buffer);
  }
  return importEpub(file, id, buffer);
}

async function importTxt(file: File, id: string, buffer: ArrayBuffer): Promise<ImportResult> {
  let document;
  try {
    const { analyzeTxt } = await import('../formats/txt');
    document = analyzeTxt(buffer, file.name);
  } catch (error) {
    const message = (error as Error | null)?.message;
    return {
      status: 'error',
      message: message === 'EMPTY' ? '文件里没有可读的文字' : '这个 TXT 无法解析，可能不是纯文本文件',
    };
  }

  const { buildTxtEpub } = await import('../formats/txt');
  const epubBuffer = await buildTxtEpub(document);
  const blob = new Blob([epubBuffer], { type: 'application/epub+zip' });
  const chapterChars = document.chapters.map((chapter) =>
    chapter.body.replace(/\s/g, '').length,
  );
  const toc = document.chapters.map((chapter, index) => ({
    label: chapter.title,
    href: `ch${index + 1}.xhtml`,
    depth: 0,
  }));

  const engine = new EpubJsEngine();
  try {
    // 章节字数与目录都已知，跳过 epub.js 的全书定位索引与 nav 解析（大文件会慢几十秒）
    await engine.open(epubBuffer, { chapterChars, toc });
    const book: BookRecord = {
      id,
      title: document.title,
      author: document.author,
      fileName: file.name,
      fileSize: file.size,
      format: 'txt',
      chapterCount: document.chapters.length,
      totalChars: document.charCount,
      chapterChars,
      toc,
      addedAt: Date.now(),
      status: 'unread',
      file: blob,
    };

    await addBook(book);
    return { status: 'added', book };
  } catch {
    return { status: 'error', message: 'TXT 转换后无法打开，请换一个文件试试' };
  } finally {
    engine.destroy();
  }
}

async function importPdf(file: File, id: string, buffer: ArrayBuffer): Promise<ImportResult> {
  const pdf = await import('../formats/pdf');

  let handle: PdfHandle | null = null;
  try {
    handle = await pdf.openPdf(buffer);
  } catch (error) {
    return { status: 'error', message: pdf.describePdfError(error) };
  }

  const doc = handle.doc;
  try {
    const meta = await pdf.readPdfMetadata(doc);
    const cover = await pdf.renderPdfCover(doc);
    const fallbackTitle = trimBookTitle(fileNameTitle(file.name)) || '未命名 PDF';
    const title = trimBookTitle(meta.title) || fallbackTitle;

    const book: BookRecord = {
      id,
      title,
      author: meta.author || '未知作者',
      cover,
      fileName: file.name,
      fileSize: file.size,
      format: 'pdf',
      chapterCount: doc.numPages,
      pageCount: doc.numPages,
      totalChars: 0,
      addedAt: Date.now(),
      status: 'unread',
      file: new Blob([buffer], { type: 'application/pdf' }),
    };

    await addBook(book);
    return { status: 'added', book };
  } catch (error) {
    return { status: 'error', message: pdf.describePdfError(error) };
  } finally {
    void handle?.destroy();
  }
}

async function importEpub(file: File, id: string, buffer: ArrayBuffer): Promise<ImportResult> {
  const engine = new EpubJsEngine();
  try {
    // 先不生成全书位置索引：大书要几十秒，改为直接统计各节字数
    await engine.open(buffer, { skipLocations: true });
    const meta = engine.meta();
    const cover = await engine.cover();
    const toc = engine.toc();
    const chapterChars = await engine.measureSections();
    const hasWeights = chapterChars.some((value) => value > 0);
    const fallbackTitle = trimBookTitle(fileNameTitle(file.name)) || '未命名书籍';
    const title = trimBookTitle(meta.title) || fallbackTitle;
    const author = meta.author || '未知作者';

    let locations: string | undefined;
    if (!hasWeights) {
      await engine.ensureLocations();
      locations = engine.locationsJson() ?? undefined;
    }

    const totalChars = hasWeights
      ? chapterChars.reduce((sum, value) => sum + value, 0)
      : Math.max(engine.totalLocations() * 1024, 1024);

    const book: BookRecord = {
      id,
      title,
      author,
      cover,
      fileName: file.name,
      fileSize: file.size,
      format: 'epub',
      chapterCount: toc.length,
      totalChars,
      chapterChars: hasWeights ? chapterChars : undefined,
      addedAt: Date.now(),
      status: 'unread',
      file: new Blob([buffer], { type: 'application/epub+zip' }),
      locations,
    };

    await addBook(book);
    return { status: 'added', book };
  } catch {
    return { status: 'error', message: '无法解析这个文件，可能已损坏、加密或不是 EPUB 格式' };
  } finally {
    engine.destroy();
  }
}
