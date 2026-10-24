import type { SourceRecord } from '../types';
import { sha256Text } from '../lib/utils';
import { addSource, getSource } from '../storage/repository';
import type { LegadoSource, SourceRuleSet } from './types';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function ruleSet(value: unknown): SourceRuleSet | undefined {
  const object = asObject(value);
  if (!object) return undefined;
  const rules: SourceRuleSet = {};
  for (const [key, entry] of Object.entries(object)) {
    if (typeof entry === 'string' && entry.trim()) rules[key] = entry.trim();
  }
  return Object.keys(rules).length > 0 ? rules : undefined;
}

/** 只保留本引擎认识的字段；其余 Legado 配置在导入时忽略 */
export function normalizeSource(raw: unknown): LegadoSource | null {
  const object = asObject(raw);
  if (!object) return null;
  const name = text(object.bookSourceName);
  const url = text(object.bookSourceUrl);
  if (!name || !url) return null;

  return {
    bookSourceName: name,
    bookSourceUrl: url,
    bookSourceGroup: text(object.bookSourceGroup) || '未分组',
    bookSourceComment: text(object.bookSourceComment),
    bookSourceType:
      typeof object.bookSourceType === 'number' ? object.bookSourceType : undefined,
    enabled: object.enabled !== false,
    searchUrl: text(object.searchUrl),
    header: typeof object.header === 'string' ? object.header : undefined,
    ruleSearch: ruleSet(object.ruleSearch ?? object.searchRule),
    ruleBookInfo: ruleSet(object.ruleBookInfo ?? object.bookInfoRule),
    ruleToc: ruleSet(object.ruleToc ?? object.tocRule),
    ruleContent: ruleSet(object.ruleContent ?? object.contentRule),
  };
}

export function loadSource(json: string): LegadoSource {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('书源 JSON 格式不正确');
  }
  const source = normalizeSource(parsed);
  if (!source) throw new Error('书源缺少 bookSourceName 或 bookSourceUrl');
  return source;
}

function validateSource(source: LegadoSource): void {
  const name = source.bookSourceName ?? '未命名书源';
  if (!source.searchUrl) throw new Error(`《${name}》没有 searchUrl，暂不支持只有发现页的书源`);
  const search = source.ruleSearch;
  if (!search?.bookList || !search.name || !search.bookUrl) {
    throw new Error(`《${name}》缺少搜索规则（bookList / name / bookUrl）`);
  }
  const toc = source.ruleToc;
  if (!toc?.chapterList || !toc.chapterName || !toc.chapterUrl) {
    throw new Error(`《${name}》缺少目录规则（chapterList / chapterName / chapterUrl）`);
  }
  if (!source.ruleContent?.content) {
    throw new Error(`《${name}》缺少正文规则（content）`);
  }
}

export interface SourceImportResult {
  added: number;
  skipped: number;
  errors: string[];
}

export async function importSourceText(input: string): Promise<SourceImportResult> {
  const textValue = input.replace(/^\uFEFF/, '').trim();
  if (!textValue) throw new Error('书源 JSON 为空');

  let parsed: unknown;
  try {
    parsed = JSON.parse(textValue);
  } catch {
    throw new Error('书源 JSON 格式不正确');
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const result: SourceImportResult = { added: 0, skipped: 0, errors: [] };

  for (let index = 0; index < list.length; index += 1) {
    const source = normalizeSource(list[index]);
    if (!source) {
      result.skipped += 1;
      result.errors.push(`第 ${index + 1} 个书源缺少名称或地址`);
      continue;
    }
    try {
      validateSource(source);
    } catch (error) {
      result.skipped += 1;
      result.errors.push(error instanceof Error ? error.message : '书源规则不完整');
      continue;
    }

    const id = await sha256Text(
      `source:${source.bookSourceUrl}\n${source.bookSourceName}\n${source.searchUrl}`,
    );
    const existing = await getSource(id);
    const record: SourceRecord = {
      id,
      name: source.bookSourceName ?? '未命名书源',
      url: source.bookSourceUrl ?? '',
      group: source.bookSourceGroup ?? '未分组',
      enabled: source.enabled !== false,
      json: JSON.stringify(source),
      createdAt: existing?.createdAt ?? Date.now(),
    };
    await addSource(record);
    result.added += 1;
  }

  return result;
}
