import type { BookFormat } from '../types';

/**
 * 扩展名优先，魔数兜底：有些文件被改过后缀，或下载后没有扩展名。
 * TXT 没有魔数，只认扩展名。
 */
export function detectFormat(fileName: string, head?: Uint8Array): BookFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf' || ext === 'epub' || ext === 'txt') return ext;

  if (head && head.length >= 4) {
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
      return 'pdf';
    }
    if (head[0] === 0x50 && head[1] === 0x4b) {
      return 'epub';
    }
  }

  return null;
}

export function acceptAttribute(): string {
  return '.epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain';
}

export function formatLabel(format: BookFormat): string {
  if (format === 'pdf') return 'PDF';
  if (format === 'txt') return 'TXT';
  return 'EPUB';
}
