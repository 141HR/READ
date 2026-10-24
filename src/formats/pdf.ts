import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfWorker from './pdfWorker?worker';

// worker 单独跑，必须把 Promise.withResolvers 等兼容补丁也带进 worker 线程
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

const assetBase = import.meta.env.BASE_URL;

const DOCUMENT_OPTIONS = {
  cMapUrl: `${assetBase}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${assetBase}pdfjs/standard_fonts/`,
  isEvalSupported: false,
};

export interface PdfOutlineEntry {
  label: string;
  page: number;
  depth: number;
}

export interface PdfMeta {
  title: string;
  author: string;
  pageCount: number;
  cover?: string;
}

export interface PdfHandle {
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

/**
 * pdf.js 会把传入的 ArrayBuffer 转移（detach）给 worker，
 * 这里传副本，避免导入时原始 Blob 数据被清空。
 */
export async function openPdf(data: ArrayBuffer): Promise<PdfHandle> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), ...DOCUMENT_OPTIONS });
  try {
    const doc = await task.promise;
    return { doc, destroy: () => task.destroy() };
  } catch (error) {
    void task.destroy();
    throw error;
  }
}

export async function readPdfMetadata(doc: PDFDocumentProxy): Promise<{ title: string; author: string }> {
  try {
    const result = await doc.getMetadata();
    const info = (result.info ?? {}) as { Title?: string; Author?: string };
    return {
      title: (info.Title ?? '').trim(),
      author: (info.Author ?? '').trim(),
    };
  } catch {
    return { title: '', author: '' };
  }
}

export async function renderPdfCover(doc: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 520 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas: null, canvasContext: context, viewport }).promise;
    page.cleanup();
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return undefined;
  }
}

export async function readPdfOutline(doc: PDFDocumentProxy): Promise<PdfOutlineEntry[]> {
  try {
    const outline = await doc.getOutline();
    if (!outline?.length) return [];
    return await flattenOutline(doc, outline, 0);
  } catch {
    return [];
  }
}

async function flattenOutline(
  doc: PDFDocumentProxy,
  items: Array<{ title: string; dest: unknown; items?: unknown[] }>,
  depth: number,
): Promise<PdfOutlineEntry[]> {
  const result: PdfOutlineEntry[] = [];

  for (const item of items) {
    let destination = item.dest;
    if (typeof destination === 'string') {
      try {
        destination = await doc.getDestination(destination);
      } catch {
        destination = null;
      }
    }

    let page = 1;
    if (Array.isArray(destination) && destination.length > 0) {
      const target = destination[0];

      // 有些 PDF（常见于国内排版工具导出的文件）在 outline 里直接写 0 起的整数页号，
      // 而不是页面对象引用，pdf.js 的 getPageIndex 会拒绝这种值。
      if (typeof target === 'number') {
        page = Math.min(Math.max(Math.round(target), 0), doc.numPages - 1) + 1;
      } else {
        try {
          page = (await doc.getPageIndex(target)) + 1;
        } catch {
          page = 1;
        }
      }
    }

    const label = (item.title ?? '').replace(/\s+/g, ' ').trim();
    if (label) {
      result.push({ label, page, depth });
    }

    const children = item.items as Array<{ title: string; dest: unknown; items?: unknown[] }> | undefined;
    if (children?.length) {
      result.push(...(await flattenOutline(doc, children, depth + 1)));
    }
  }

  return result;
}

export function describePdfError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'PasswordException') return '这个 PDF 有密码保护，暂不支持打开';
  if (name === 'InvalidPDFException') return '文件不是有效的 PDF，可能已损坏';
  return 'PDF 解析失败，文件可能已损坏';
}
