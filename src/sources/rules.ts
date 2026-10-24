import type { SourceRuleSet } from './types';

type QueryRoot = Document | Element;

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'dd',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const EXTRACTIONS = new Set(['text', 'owntext', 'html', 'href', 'src', 'title', 'alt', 'content']);

export class UnsupportedRuleError extends Error {}

export function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function normalizeSelector(selector: string): string {
  return selector
    .split(',')
    .map((part) => {
      let value = part.trim();
      if (!value) return '';
      if (value.startsWith('text.')) {
        throw new UnsupportedRuleError('暂不支持 text. 选择器');
      }
      if (value.startsWith('//')) {
        throw new UnsupportedRuleError('暂不支持 XPath 规则');
      }
      if (value.startsWith('class.')) value = `.${value.slice(6)}`;
      else if (value.startsWith('id.')) value = `#${value.slice(3)}`;
      else if (value.startsWith('tag.')) value = value.slice(4);
      return value;
    })
    .filter(Boolean)
    .join(', ');
}

function isExtraction(value: string): boolean {
  const lower = value.toLowerCase();
  if (EXTRACTIONS.has(lower)) return true;
  if (lower.startsWith('abs:')) return true;
  if (lower.startsWith('data-') || lower.startsWith('aria-')) return true;
  return false;
}

function splitTransform(rule: string): {
  expression: string;
  pattern?: string;
  replacement?: string;
} {
  const parts = rule.split('##');
  if (parts.length < 2) return { expression: rule };
  return {
    expression: parts[0],
    pattern: parts[1],
    replacement: parts.slice(2).join('##'),
  };
}

function parseExpression(rule: string): {
  selector: string;
  extraction: string;
  index: number | null;
} {
  let expression = rule.trim();
  if (expression.startsWith('@css:')) expression = expression.slice(5);
  if (expression.startsWith('@json:') || expression.startsWith('@xpath:')) {
    throw new UnsupportedRuleError('暂不支持 JSONPath / XPath 规则');
  }
  if (expression.includes('@js:')) {
    throw new UnsupportedRuleError('暂不支持 @js: 脚本规则');
  }

  let index: number | null = null;
  const indexMatch = expression.match(/!(-?\d+)$/);
  if (indexMatch) {
    index = Number(indexMatch[1]);
    expression = expression.slice(0, indexMatch.index);
  }

  const parts = expression.split('@');
  const last = parts[parts.length - 1]?.trim() ?? '';
  let extraction = 'text';
  let selectorParts = parts;

  if (parts.length > 1 && isExtraction(last)) {
    extraction = last.toLowerCase();
    selectorParts = parts.slice(0, -1);
  }

  const selector = selectorParts
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeSelector)
    .filter(Boolean)
    .join(' ');

  return { selector, extraction, index };
}

function nodesOf(root: QueryRoot, selector: string): Element[] {
  if (!selector) {
    if (root instanceof Element) return [root];
    return root.body ? [root.body] : [];
  }
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    throw new UnsupportedRuleError(`无效的 CSS 选择器：${selector}`);
  }
}

function pickNode(nodes: Element[], index: number | null): Element | null {
  if (nodes.length === 0) return null;
  if (index === null) return nodes[0];
  const target = index < 0 ? nodes.length + index : index;
  return nodes[target] ?? null;
}

function ownText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent ?? '')
    .join('');
}

export function resolveUrl(baseUrl: string, value: string): string {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function attributeValue(node: Element, attribute: string, baseUrl: string): string {
  if (attribute.startsWith('abs:')) {
    const name = attribute.slice(4);
    return resolveUrl(baseUrl, node.getAttribute(name) ?? '');
  }
  const value = node.getAttribute(attribute) ?? '';
  if (attribute === 'href' || attribute === 'src') return resolveUrl(baseUrl, value);
  return value;
}

export function parseRule(
  root: QueryRoot,
  rule: string | undefined,
  baseUrl: string,
): string {
  if (!rule) return '';
  const { expression, pattern, replacement } = splitTransform(rule);
  const { selector, extraction, index } = parseExpression(expression);
  const node = pickNode(nodesOf(root, selector), index);
  if (!node) return '';

  let value: string;
  if (extraction === 'text') value = node.textContent ?? '';
  else if (extraction === 'owntext') value = ownText(node);
  else if (extraction === 'html') value = node.innerHTML;
  else value = attributeValue(node, extraction, baseUrl);

  if (pattern !== undefined) {
    try {
      value = value.replace(new RegExp(pattern, 'g'), replacement ?? '');
    } catch {
      throw new UnsupportedRuleError(`无效的正则规则：##${pattern}##`);
    }
  }

  return cleanText(value);
}

export function selectRuleElements(root: QueryRoot, rule: string | undefined): Element[] {
  if (!rule) return [];
  const { expression } = splitTransform(rule);
  let value = expression.trim();
  if (value.startsWith('@css:')) value = value.slice(5);
  if (value.startsWith('@json:') || value.startsWith('@xpath:')) {
    throw new UnsupportedRuleError('暂不支持 JSONPath / XPath 规则');
  }
  if (value.includes('@js:')) throw new UnsupportedRuleError('暂不支持 @js: 脚本规则');

  const parts = value.split('@');
  const last = parts[parts.length - 1]?.trim() ?? '';
  const selectorParts = isExtraction(last) ? parts.slice(0, -1) : parts;
  const selector = selectorParts
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeSelector)
    .filter(Boolean)
    .join(' ');
  return nodesOf(root, selector);
}

export function parseHeaders(header: string | undefined): Record<string, string> {
  if (!header) return {};
  try {
    const value: unknown = JSON.parse(header);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value]),
    );
  } catch {
    return {};
  }
}

export function applyUrlTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name];
    return value === undefined ? '' : value;
  });
}

export function rulesOf(source: {
  ruleSearch?: SourceRuleSet;
  ruleBookInfo?: SourceRuleSet;
  ruleToc?: SourceRuleSet;
  ruleContent?: SourceRuleSet;
  searchRule?: SourceRuleSet;
  bookInfoRule?: SourceRuleSet;
  tocRule?: SourceRuleSet;
  contentRule?: SourceRuleSet;
}, kind: 'search' | 'info' | 'toc' | 'content'): SourceRuleSet {
  if (kind === 'search') return source.ruleSearch ?? source.searchRule ?? {};
  if (kind === 'info') return source.ruleBookInfo ?? source.bookInfoRule ?? {};
  if (kind === 'toc') return source.ruleToc ?? source.tocRule ?? {};
  return source.ruleContent ?? source.contentRule ?? {};
}

export function htmlToText(html: string): string {
  if (!/<[a-z!/][\s\S]*>/i.test(html)) {
    return html
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('script, style, noscript').forEach((node) => node.remove());

  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      parts.push('\n');
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) parts.push('\n');
    node.childNodes.forEach(walk);
    if (block) parts.push('\n');
  };

  walk(doc.body);
  return parts
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
