export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export async function sha256Hex(input: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Text(value: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelativeDay(timestamp?: number): string {
  if (!timestamp) return '未读';
  const diff = Date.now() - timestamp;
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000) return '刚刚读过';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 2 * day) return '昨天';
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function formatPercent(percent: number): string {
  const value = clamp(percent, 0, 1);
  if (value > 0 && value < 0.01) return `${(value * 100).toFixed(1)}%`;
  return `${Math.floor(value * 100)}%`;
}

export function formatRemaining(seconds: number): string {  if (!Number.isFinite(seconds) || seconds <= 0) return '已读完';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `约剩 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `约剩 ${hours} 小时` : `约剩 ${hours} 小时 ${rest} 分`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function basename(path: string): string {
  const clean = path.split('#')[0].split('?')[0];
  return clean.substring(clean.lastIndexOf('/') + 1);
}

/** 书名两侧常见的《》、【】、[] 不属于书名本身，三种格式统一清理 */
export function trimBookTitle(value: string): string {
  return value
    .replace(/^[《【\[]\s*/, '')
    .replace(/\s*[》】\]]$/, '')
    .trim();
}

export function fileNameTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

/**
 * 书签按阅读位置排序，而不是按添加时间。
 * 老版本书签没有 percent，拿不到位置，统一排在末尾。
 */
export function sortBookmarks<T extends { percent?: number; createdAt: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const left = typeof a.percent === 'number' ? a.percent : null;
    const right = typeof b.percent === 'number' ? b.percent : null;
    if (left !== null && right !== null && left !== right) return left - right;
    if (left !== null && right === null) return -1;
    if (left === null && right !== null) return 1;
    return a.createdAt - b.createdAt;
  });
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
