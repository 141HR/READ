import JSZip from 'jszip';
import { trimBookTitle } from '../lib/utils';

export interface TxtChapter {
  title: string;
  body: string;
}

export interface TxtDocument {
  title: string;
  author: string;
  encoding: string;
  chapters: TxtChapter[];
  charCount: number;
}

const MAX_CHAPTER_CHARS = 16000;
const FALLBACK_CHUNK_CHARS = 4200;

const HEADING_PATTERNS = [
  /^第\s*[0-9零〇一二三四五六七八九十百千万两]{1,8}\s*[章节回卷篇部集](\s|$|[：:、.·—-])/,
  /^第\s*[0-9零〇一二三四五六七八九十百千万两]{1,8}\s*[章节回卷篇部集].{1,30}$/,
  /^(序章|序言|序|楔子|引子|前言|后记|尾声|结语|番外|外传)(\s|$|[：:、.·—-])/,
  /^chapter\s+[\divxlcdm]+/i,
];

export function decodeTxt(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('gb18030').decode(bytes), encoding: 'GB18030' };
  }
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\uFEFF/g, '');
}

function isHeading(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > 42) return false;
  return HEADING_PATTERNS.some((pattern) => pattern.test(value));
}

function titleFromFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/\.txt$/i, '')
    .replace(/[【\[（(][^】\]）)]{0,16}[】\]）)]\s*$/g, '')
    .replace(/[_\-\s]+$/g, '')
    .trim();
  return cleaned || '未命名';
}

function parseMeta(lines: string[], fileName: string): { title: string; author: string } {
  let title = '';
  let author = '';

  for (const raw of lines.slice(0, 40)) {
    const line = raw.trim();
    if (!line) continue;
    const titleMatch = line.match(/^(?:书\s*名|标\s*题|title)\s*[:：]\s*(.{1,60})$/i);
    if (titleMatch) title = titleMatch[1].trim();
    const authorMatch = line.match(/^(?:作\s*者|著\s*者|author)\s*[:：]\s*(.{1,30})$/i);
    if (authorMatch) author = authorMatch[1].trim();
  }

  const fallback = titleFromFileName(fileName);
  return {
    title: trimBookTitle(title || fallback) || fallback,
    author: author || '佚名',
  };
}

const GUTENBERG_START = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
const GUTENBERG_END = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;

/** 古登堡的 TXT 前后各有一段英文授权声明，读起来很出戏，按标记裁掉 */
function stripGutenbergWrapper(text: string): string {
  let value = text;

  const start = value.search(GUTENBERG_START);
  if (start >= 0) {
    const lineEnd = value.indexOf('\n', start);
    value = lineEnd >= 0 ? value.slice(lineEnd + 1) : '';
  }

  const end = value.search(GUTENBERG_END);
  if (end >= 0) value = value.slice(0, end);

  return value.trim();
}

function splitByHeadings(text: string): { preface: string; chapters: TxtChapter[] } {
  const lines = text.split('\n');
  const chapters: TxtChapter[] = [];
  const prefaceLines: string[] = [];
  let currentTitle = '';
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (currentTitle && body) chapters.push({ title: currentTitle, body });
    buffer = [];
  };

  for (const line of lines) {
    if (isHeading(line)) {
      if (currentTitle) {
        flush();
      } else if (buffer.join('').trim()) {
        prefaceLines.push(...buffer);
        buffer = [];
      }
      currentTitle = line.trim().replace(/\s+/g, ' ');
    } else {
      buffer.push(line);
    }
  }
  flush();

  return { preface: prefaceLines.join('\n').trim(), chapters };
}

function fallbackChapters(text: string): TxtChapter[] {
  const lines = text.split('\n');
  const chapters: TxtChapter[] = [];
  let buffer: string[] = [];
  let size = 0;

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) chapters.push({ title: `第 ${chapters.length + 1} 节`, body });
    buffer = [];
    size = 0;
  };

  for (const line of lines) {
    buffer.push(line);
    size += line.length + 1;
    if (size >= FALLBACK_CHUNK_CHARS) flush();
  }
  flush();

  return chapters;
}

function chunkChapter(chapter: TxtChapter): TxtChapter[] {
  if (chapter.body.length <= MAX_CHAPTER_CHARS) return [chapter];

  const lines = chapter.body.split('\n');
  const parts: TxtChapter[] = [];
  let buffer: string[] = [];
  let size = 0;
  let part = 1;

  const flush = () => {
    if (!buffer.length) return;
    const body = buffer.join('\n').trim();
    if (body) {
      parts.push({
        title: part === 1 ? chapter.title : `${chapter.title}（续 ${part}）`,
        body,
      });
      part += 1;
    }
    buffer = [];
    size = 0;
  };

  for (const line of lines) {
    buffer.push(line);
    size += line.length + 1;
    if (size >= MAX_CHAPTER_CHARS) flush();
  }
  flush();

  return parts.length > 0 ? parts : [chapter];
}

export function analyzeTxt(buffer: ArrayBuffer, fileName: string): TxtDocument {
  const decoded = decodeTxt(buffer);
  const raw = normalizeText(decoded.text).trim();
  if (!raw) throw new Error('EMPTY');

  const meta = parseMeta(raw.split('\n'), fileName);
  const content = stripGutenbergWrapper(raw);
  if (!content) throw new Error('EMPTY');

  const { preface, chapters } = splitByHeadings(content);

  let result = chapters.length > 0 ? chapters : fallbackChapters(content);

  if (preface.length > 60) {
    result = [{ title: '卷首', body: preface }, ...result];
  }

  result = result.flatMap(chunkChapter);

  if (result.length === 0) throw new Error('EMPTY');

  return {
    title: meta.title,
    author: meta.author,
    encoding: decoded.encoding,
    chapters: result,
    charCount: content.replace(/\s/g, '').length,
  };
}

const CHAPTER_CSS = `
body { margin: 0; padding: 0; }
h2 { font-size: 1.4em; font-weight: 500; margin: 1em 0 1.2em; letter-spacing: 0.02em; }
p { margin: 0 0 0.95em; text-indent: 2em; }
`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphsOf(body: string): string[] {
  const text = body.trim();
  if (!text) return [];
  const blocks = /\n\s*\n/.test(text) ? text.split(/\n{2,}/) : text.split('\n');
  return blocks
    .map((block) => block.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean);
}

function chapterPage(title: string, body: string): string {
  const paragraphs = paragraphsOf(body)
    .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2>${escapeXml(title)}</h2>
${paragraphs}
</body>
</html>`;
}

export async function buildTxtEpub(document: TxtDocument): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const oebps = zip.folder('OEBPS');
  if (!oebps) throw new Error('ZIP_INIT_FAILED');

  const files = document.chapters.map((_, index) => `ch${index + 1}.xhtml`);

  const navItems = document.chapters
    .map((chapter, index) => `      <li><a href="${files[index]}">${escapeXml(chapter.title)}</a></li>`)
    .join('\n');

  const manifest = document.chapters
    .map(
      (_, index) =>
        `    <item id="ch${index + 1}" href="${files[index]}" media-type="application/xhtml+xml"/>`,
    )
    .join('\n');

  const spine = document.chapters
    .map((_, index) => `    <itemref idref="ch${index + 1}"/>`)
    .join('\n');

  const identifier = `urn:uuid:${
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `txt-${Date.now()}`
  }`;

  oebps.file(
    'content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${identifier}</dc:identifier>
    <dc:title>${escapeXml(document.title)}</dc:title>
    <dc:creator>${escapeXml(document.author)}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:source>${escapeXml(document.encoding)}</dc:source>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>`,
  );

  oebps.file(
    'nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>目录</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`,
  );

  oebps.file('style.css', CHAPTER_CSS);

  document.chapters.forEach((chapter, index) => {
    oebps.file(files[index], chapterPage(chapter.title, chapter.body));
  });

  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
