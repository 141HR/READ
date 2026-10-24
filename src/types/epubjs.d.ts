declare module 'epubjs' {
  export interface NavItem {
    id?: string;
    href: string;
    label: string;
    subitems?: NavItem[];
  }

  export interface BookMetadata {
    title?: string;
    creator?: string;
    language?: string;
    description?: string;
    publisher?: string;
  }

  export interface DisplayedLocation {
    page: number;
    total: number;
  }

  export interface LocationPoint {
    cfi: string;
    href: string;
    index: number;
    percentage?: number;
    displayed?: DisplayedLocation;
  }

  export interface LocationDetail {
    start: LocationPoint;
    end: LocationPoint;
    atStart?: boolean;
    atEnd?: boolean;
  }

  export interface Locations {
    generate(chars?: number): Promise<string[]>;
    load(json: string): void;
    save(): string;
    length(): number;
    total: number;
    percentageFromCfi(cfi: string): number;
    cfiFromPercentage(percentage: number): string;
  }

  export interface SpineItem {
    href: string;
    index: number;
    idref?: string;
  }

  export interface Spine {
    get(target: string | number): SpineItem | null;
    spineItems: SpineItem[];
  }

  export interface Content {
    document: Document;
    window: Window;
  }

  export interface Hooks {
    content: {
      register(fn: (contents: Content) => void): void;
    };
  }

  export interface Themes {
    register(name: string, rules: Record<string, Record<string, string>>): void;
    select(name: string): void;
    fontSize(size: string): void;
    font(family: string): void;
    override(name: string, value: string): void;
  }

  export class Rendition {
    display(target?: string): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    destroy(): void;
    resize(width: number, height: number): void;
    getContents(): Content[];
    on(event: string, callback: (payload: unknown) => void): void;
    hooks: Hooks;
    themes: Themes;
    currentLocation(): LocationDetail | null;
  }

  export class Book {
    ready: Promise<void>;
    loaded: {
      metadata: Promise<unknown>;
      navigation: Promise<unknown>;
      cover: Promise<string>;
    };
    packaging: { metadata: BookMetadata };
    navigation: { toc: NavItem[] };
    spine: Spine;
    locations: Locations;
    renderTo(element: HTMLElement | string, options?: Record<string, unknown>): Rendition;
    coverUrl(): string | null | Promise<string | null>;
    destroy(): void;
  }

  interface EpubFactory {
    (input: ArrayBuffer | string, options?: Record<string, unknown>): Book;
    new (input: ArrayBuffer | string, options?: Record<string, unknown>): Book;
  }

  const ePub: EpubFactory;
  export default ePub;
}
