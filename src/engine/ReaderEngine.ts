import type { ReaderSettings } from '../types';

export interface TocEntry {
  label: string;
  href: string;
  depth: number;
}

export interface ReaderLocation {
  cfi: string;
  chapterHref: string;
  chapterTitle: string;
  chapterIndex: number;
  percent: number;
}

export interface BookMeta {
  title: string;
  author: string;
}

export interface OpenOptions {
  locations?: string;
  chapterChars?: number[];
  toc?: TocEntry[];
  skipLocations?: boolean;
}

export interface ReaderEngine {
  open(input: ArrayBuffer, options?: OpenOptions): Promise<void>;
  mount(host: HTMLElement): void;
  display(target?: string): Promise<void>;

  next(): Promise<void>;
  prev(): Promise<void>;
  goToPercent(percent: number): Promise<void>;
  goToHref(href: string): Promise<void>;
  goBack(): Promise<void>;
  canGoBack(): boolean;
  firstHref(): string | undefined;

  setSettings(settings: ReaderSettings): void;
  toc(): TocEntry[];
  meta(): BookMeta;
  cover(): Promise<string | undefined>;
  measureSections(): Promise<number[]>;
  ensureLocations(): Promise<void>;
  excerpt(): string;
  locationsJson(): string | null;
  totalLocations(): number;

  onRelocated(callback: (location: ReaderLocation) => void): void;
  onTap(callback: (ratio: number) => void): void;

  resize(): void;
  destroy(): void;
}
