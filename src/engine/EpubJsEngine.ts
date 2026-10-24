import ePub, {
  type Book,
  type Content,
  type LocationDetail,
  type NavItem,
  type Rendition,
} from 'epubjs';
import { FONT_STACKS, READER_THEMES } from '../lib/theme';
import { blobToDataUrl, clamp } from '../lib/utils';
import type { ReaderSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import type { BookMeta, OpenOptions, ReaderEngine, ReaderLocation, TocEntry } from './ReaderEngine';

const LOCATION_CHARS = 1024;

export class EpubJsEngine implements ReaderEngine {
  private book: Book | null = null;
  private rendition: Rendition | null = null;
  private settings: ReaderSettings = DEFAULT_SETTINGS;
  private tocEntries: TocEntry[] = [];
  private locationsReady = false;
  private weights: number[] | null = null;
  private weightTotal = 0;

  private relocatedCallback: ((location: ReaderLocation) => void) | null = null;
  private tapCallback: ((ratio: number) => void) | null = null;

  private host: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private resizeTimer: number | undefined;

  private currentHref = '';
  private currentCfi = '';
  private backStack: string[] = [];

  async open(input: ArrayBuffer, options?: OpenOptions): Promise<void> {
    const book = ePub(input);
    this.book = book;
    await book.ready;

    if (options?.locations) {
      try {
        book.locations.load(options.locations);
        this.locationsReady = true;
      } catch {
        this.locationsReady = false;
      }
    }

    if (options?.chapterChars?.length) {
      this.weights = options.chapterChars;
      this.weightTotal = options.chapterChars.reduce((sum, value) => sum + value, 0);
    }

    if (!this.locationsReady && !this.weights && !options?.skipLocations) {
      await book.locations.generate(LOCATION_CHARS);
      this.locationsReady = true;
    }

    this.tocEntries = options?.toc ?? this.flattenToc(book.navigation.toc);
  }

  mount(host: HTMLElement): void {
    if (!this.book) throw new Error('书籍尚未打开');
    this.host = host;

    const rendition = this.book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
      allowScriptedContent: false,
    });
    this.rendition = rendition;

    rendition.hooks.content.register((contents: Content) => {
      this.bindContent(contents);
    });

    rendition.on('relocated', (payload) => {
      this.handleRelocated(payload as LocationDetail);
    });

    this.observeResize(host);
  }

  async display(target?: string): Promise<void> {
    if (!this.rendition) return;
    await this.rendition.display(target);
    this.currentCfi = target ?? this.currentCfi;
  }

  async next(): Promise<void> {
    await this.rendition?.next();
  }

  async prev(): Promise<void> {
    await this.rendition?.prev();
  }

  async goToPercent(percent: number): Promise<void> {
    if (!this.book || !this.rendition) return;
    const target = clamp(percent, 0, 1);

    if (this.locationsReady) {
      const cfi = this.book.locations.cfiFromPercentage(target);
      if (cfi) await this.rendition.display(cfi);
      return;
    }

    if (this.weights && this.weightTotal > 0) {
      const goal = target * this.weightTotal;
      let accumulated = 0;
      let index = 0;
      for (let cursor = 0; cursor < this.weights.length; cursor += 1) {
        if (accumulated + this.weights[cursor] >= goal) {
          index = cursor;
          break;
        }
        accumulated += this.weights[cursor];
        index = cursor;
      }
      const entry = this.book?.spine.spineItems[index];
      if (entry?.href) await this.goToHref(entry.href);
    }
  }

  async goToHref(href: string): Promise<void> {
    if (!this.rendition) return;
    try {
      await this.rendition.display(href);
    } catch {
      /* 目录项指向不存在的章节时忽略 */
    }
  }

  async goBack(): Promise<void> {
    const previous = this.backStack.pop();
    if (!previous || !this.rendition) return;
    await this.rendition.display(previous);
  }

  canGoBack(): boolean {
    return this.backStack.length > 0;
  }

  firstHref(): string | undefined {
    return this.tocEntries[0]?.href;
  }

  setSettings(settings: ReaderSettings): void {
    this.settings = settings;
    const contents = this.rendition?.getContents() ?? [];
    contents.forEach((content) => this.applyStyles(content.document));
  }

  toc(): TocEntry[] {
    return this.tocEntries;
  }

  /** 返回原始元数据，缺失值由导入层用文件名等信息兜底 */
  meta(): BookMeta {
    const metadata = this.book?.packaging.metadata;
    return {
      title: (metadata?.title ?? '').trim(),
      author: (metadata?.creator ?? '').trim(),
    };
  }

  async cover(): Promise<string | undefined> {
    if (!this.book) return undefined;
    try {
      const url = await Promise.resolve(this.book.coverUrl());
      if (!url) return undefined;
      const response = await fetch(url);
      const blob = await response.blob();
      if (blob.size < 64) return undefined;
      return await blobToDataUrl(blob);
    } catch {
      return undefined;
    }
  }

  /**
   * 直接读 zip 里的 XHTML 统计可读字数，不经过 epub.js 的 Section 渲染流程。
   * locations.generate 约 100ms/章，这里约 1-2ms/章。
   */
  async measureSections(): Promise<number[]> {
    const book = this.book;
    if (!book) return [];

    const internals = book as unknown as {
      archive?: { request(path: string, type?: string): Promise<unknown> };
      path?: { directory?: string };
    };
    const archive = internals.archive;
    if (!archive?.request) return [];

    const directory = internals.path?.directory ?? '/';
    const items = book.spine.spineItems;
    const result: number[] = [];

    const readOne = async (href: string): Promise<number> => {
      try {
        const raw = await archive.request(resolveArchivePath(directory, href), 'text');
        return typeof raw === 'string' ? countReadableChars(raw) : 0;
      } catch {
        return 0;
      }
    };

    const BATCH = 24;
    for (let index = 0; index < items.length; index += BATCH) {
      const batch = items.slice(index, index + BATCH);
      const counts = await Promise.all(batch.map((item) => readOne(item.href)));
      result.push(...counts);
    }

    return result;
  }

  async ensureLocations(): Promise<void> {
    if (!this.book || this.locationsReady || this.weights) return;
    await this.book.locations.generate(LOCATION_CHARS);
    this.locationsReady = true;
  }

  excerpt(): string {
    const contents = this.rendition?.getContents() ?? [];
    for (const content of contents) {
      const doc = content.document;
      let nodes = Array.from(doc.querySelectorAll('p, li, blockquote, dd'));
      if (nodes.length === 0) {
        nodes = Array.from(doc.querySelectorAll('div'));
      }
      for (const node of nodes) {
        const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text.length < 6) continue;
        const rect = (node as HTMLElement).getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < content.window.innerHeight * 0.7) {
          return text.slice(0, 72);
        }
      }
    }
    return '';
  }

  locationsJson(): string | null {    if (!this.book || !this.locationsReady) return null;
    try {
      return this.book.locations.save();
    } catch {
      return null;
    }
  }

  totalLocations(): number {
    return this.book?.locations.total ?? 0;
  }

  onRelocated(callback: (location: ReaderLocation) => void): void {
    this.relocatedCallback = callback;
  }

  onTap(callback: (ratio: number) => void): void {
    this.tapCallback = callback;
  }

  resize(): void {
    if (!this.rendition || !this.host) return;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width < 20 || height < 20) return;
    if (Math.abs(width - this.lastWidth) < 2 && Math.abs(height - this.lastHeight) < 2) return;
    this.lastWidth = width;
    this.lastHeight = height;
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.rendition?.resize(width, height);
    }, 150);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    window.clearTimeout(this.resizeTimer);
    try {
      this.rendition?.destroy();
    } catch {
      /* 未渲染时忽略 */
    }

    const book = this.book;
    this.rendition = null;
    this.book = null;
    this.host = null;
    this.backStack = [];

    // epub.js 在打开后仍有一串异步的资源替换任务，立刻 destroy 会让它们访问已清空的
    // resources 并抛出未捕获错误。延后一拍再销毁，任务跑完自然结束。
    if (book) {
      window.setTimeout(() => {
        try {
          book.destroy();
        } catch {
          /* 忽略重复销毁 */
        }
      }, 200);
    }
  }

  private flattenToc(items: NavItem[], depth = 0, result: TocEntry[] = []): TocEntry[] {
    for (const item of items) {
      const label = (item.label ?? '').replace(/\s+/g, ' ').trim();
      if (item.href) {
        result.push({ label: label || '未命名章节', href: item.href, depth });
      }
      if (item.subitems?.length) {
        this.flattenToc(item.subitems, depth + 1, result);
      }
    }
    return result;
  }

  private bindContent(contents: Content): void {
    const doc = contents.document as Document & { __readBound?: boolean };
    if (doc.__readBound) {
      this.applyStyles(doc);
      return;
    }
    doc.__readBound = true;
    this.applyStyles(doc);

    doc.addEventListener('click', (event) => this.handleContentClick(event));
    doc.addEventListener('keydown', (event: KeyboardEvent) => {
      const forwarded = [
        'ArrowLeft',
        'ArrowRight',
        'PageUp',
        'PageDown',
        ' ',
        'Escape',
        'm',
        'M',
        'b',
        'B',
        't',
        'T',
        '+',
        '=',
        '-',
      ];
      if (!forwarded.includes(event.key)) return;
      event.preventDefault();
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: event.key, bubbles: true, cancelable: true }),
      );
    });
    doc.addEventListener(
      'touchstart',
      (event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        this.touchStart = { x: touch.clientX, y: touch.clientY, at: Date.now() };
      },
      { passive: true },
    );
    doc.addEventListener(
      'touchend',
      (event) => {
        const start = this.touchStart;
        const touch = event.changedTouches[0];
        if (!start || !touch) return;
        this.touchStart = null;

        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Date.now() - start.at > 700) return;
        if (doc.getSelection()?.toString().trim()) return;

        if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          this.lastTouchAt = Date.now();
          if (dx < 0) {
            void this.next();
          } else {
            void this.prev();
          }
          return;
        }

        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
          const target = event.target as HTMLElement | null;
          if (target?.closest?.('a')) return;
          this.lastTouchAt = Date.now();
          this.tapCallback?.(this.tapRatio(touch.clientX, doc));
        }
      },
      { passive: true },
    );
  }

  private touchStart: { x: number; y: number; at: number } | null = null;

  private lastTouchAt = 0;

  private handleContentClick(event: MouseEvent): void {
    if (Date.now() - this.lastTouchAt < 500) return;

    const doc = event.currentTarget as Document;
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a');

    if (anchor) {
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        event.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.followLink(href);
      return;
    }

    if (doc.getSelection()?.toString().trim()) return;
    this.tapCallback?.(this.tapRatio(event.clientX, doc));
  }

  private tapRatio(clientX: number, doc: Document): number {
    const host = this.host;
    const frame = doc.defaultView?.frameElement as HTMLElement | null;
    if (!host || !frame) return 0.5;
    const hostRect = host.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const screenX = frameRect.left + clientX;
    return clamp((screenX - hostRect.left) / (hostRect.width || 1), 0, 1);
  }

  private async followLink(href: string): Promise<void> {
    if (!this.rendition) return;
    if (this.currentCfi) this.backStack.push(this.currentCfi);
    if (this.backStack.length > 20) this.backStack.shift();

    if (href.startsWith('#')) {
      if (this.currentHref) {
        try {
          await this.rendition.display(`${this.currentHref}${href}`);
          return;
        } catch {
          /* 交给兜底 */
        }
      }
      return;
    }

    try {
      const baseHref = this.currentHref.split('#')[0];
      const base = new URL(`https://epub.local/${baseHref}`);
      const url = new URL(href, base);
      const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
      await this.rendition.display(`${path}${url.hash}`);
    } catch {
      await this.rendition.display(href);
    }
  }

  private handleRelocated(location: LocationDetail): void {
    if (!location?.start) return;
    const cfi = location.start.cfi;
    const href = location.start.href ?? '';
    this.currentCfi = cfi;
    this.currentHref = href;

    const percent = this.percentFor(cfi, location);
    const title = this.titleFor(href);

    this.relocatedCallback?.({
      cfi,
      chapterHref: href,
      chapterTitle: title,
      chapterIndex: location.start.index ?? 0,
      percent,
    });
  }

  private percentFor(cfi: string, location: LocationDetail): number {
    if (location.atEnd) return 1;

    if (this.book && this.locationsReady) {
      try {
        const computed = this.book.locations.percentageFromCfi(cfi);
        if (Number.isFinite(computed) && computed >= 0) {
          return clamp(computed, 0, 0.99);
        }
      } catch {
        /* 回退到按章节权重估算 */
      }
    }

    if (this.weights && this.weightTotal > 0) {
      const index = location.start.index ?? 0;
      let before = 0;
      for (let cursor = 0; cursor < index && cursor < this.weights.length; cursor += 1) {
        before += this.weights[cursor];
      }
      const displayed = location.start.displayed;
      const fraction =
        displayed && displayed.total > 0 ? (displayed.page - 1) / displayed.total : 0;
      const current = this.weights[index] ?? 0;
      return clamp((before + fraction * current) / this.weightTotal, 0, 0.99);
    }

    const fallback = location.start.percentage;
    return Number.isFinite(fallback) ? clamp(fallback as number, 0, 0.99) : 0;
  }

  private titleFor(href: string): string {
    const base = href.split('#')[0];
    const direct = this.tocEntries.find((entry) => entry.href.split('#')[0] === base);
    if (direct) return direct.label;
    const loose = [...this.tocEntries]
      .reverse()
      .find((entry) => {
        const candidate = entry.href.split('#')[0];
        return candidate.endsWith(base) || base.endsWith(candidate);
      });
    return loose?.label ?? '正文';
  }

  private applyStyles(doc: Document): void {
    const theme = READER_THEMES[this.settings.theme];
    let style = doc.getElementById('read-injected-style') as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = 'read-injected-style';
      doc.head?.appendChild(style);
    }

    const nightImage = this.settings.theme === 'night' ? 'opacity: 0.82 !important;' : '';
    style.textContent = `
      html, body {
        background: ${theme.bg} !important;
        color: ${theme.text} !important;
      }
      body {
        font-family: ${FONT_STACKS[this.settings.fontFamily]} !important;
        font-size: ${this.settings.fontSize}px !important;
        -webkit-font-smoothing: antialiased;
        padding: 0 !important;
        margin: 0 !important;
      }
      body, p, div, li, dd, dt, blockquote, td, th {
        line-height: ${this.settings.lineHeight} !important;
      }
      a, a:visited { color: ${theme.link} !important; text-decoration: none; }
      img { max-width: 100% !important; height: auto !important; ${nightImage} }
      svg, video { max-width: 100% !important; }
      ::selection { background: ${theme.selection} !important; }
      hr { border-color: ${theme.line} !important; }
      blockquote { border-left: 2px solid ${theme.line}; padding-left: 1em; color: ${theme.muted}; }
    `;
  }

  private observeResize(host: HTMLElement): void {
    this.observer?.disconnect();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
  }
}

function resolveArchivePath(directory: string, href: string): string {
  // epub.js 的 Archive.request 会先 substr(1) 去掉前导斜杠，所以这里必须带 /
  const base = `https://epub.local${directory.startsWith('/') ? '' : '/'}${directory}`;
  try {
    const url = new URL(href, base);
    return url.pathname;
  } catch {
    return href.startsWith('/') ? href : `/${href}`;
  }
}

function countReadableChars(html: string): number {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z#0-9]{1,8};/g, 'x')
    .replace(/\s/g, '').length;
}
