import { z } from 'zod';
import {
  projectConfigSchema,
  storedProjectConfigSchema,
} from '../lib/devpulse/schema.ts';
import { sortProjectsByTier } from '../lib/devpulse/sort-projects.ts';
import type { ProjectDefinition } from '../lib/devpulse/types.ts';

export const CONFIG_KEY = 'config:projects:v1';
/** 置き換えられた直前の revision を新しい順に保持する。現在の revision は含まない。 */
export const CONFIG_HISTORY_KEY = 'config:projects:history:v1';
export const HISTORY_LIMIT = 20;

export type StoredProjectConfig = {
  revision: number;
  updatedAt: string;
  updatedBy: string;
  projects: ProjectDefinition[];
};

/**
 * 履歴の projects は保存時点のスキーマで検証済みだが、その後のスキーマ変更に
 * 備えて読み出しでは形だけを確認する。復元時に projectConfigSchema で検証し直す。
 */
const historyEntrySchema = z.strictObject({
  revision: z.number().int().positive(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  projects: z.array(z.unknown()),
});
const historySchema = z.array(historyEntrySchema);

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** KVNamespace の部分集合。seed スクリプトは wrangler 経由の実装を渡す。 */
export interface ConfigKv {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** 値が存在しない。fixture にはフォールバックしない。 */
export class ConfigMissingError extends Error {
  constructor() {
    super(`${CONFIG_KEY} is not set; run "pnpm run config:seed"`);
  }
}

export class ConfigInvalidError extends Error {
  constructor(detail: string, key = CONFIG_KEY) {
    super(`${key} is invalid: ${detail}`);
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

/** 保存時に読み直した revision が期待値と一致しない。 */
export class ConfigConflictError extends Error {
  // scripts/ から Node の型除去で実行されるため、parameter property は使わない。
  expected: number | null;
  actual: number | null;
  constructor(expected: number | null, actual: number | null) {
    super(
      `${CONFIG_KEY} revision conflict: expected ${expected}, got ${actual}`,
    );
    this.expected = expected;
    this.actual = actual;
  }
}

async function readStored(kv: ConfigKv): Promise<StoredProjectConfig | null> {
  const text = await kv.get(CONFIG_KEY, 'text');
  if (text === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ConfigInvalidError('not valid JSON');
  }
  const parsed = storedProjectConfigSchema.safeParse(json);
  if (!parsed.success)
    throw new ConfigInvalidError(describeIssues(parsed.error));
  return parsed.data;
}

/** 新しい順。値がなければ空。壊れていれば書き込みも止める(履歴を黙って捨てない)。 */
export async function readProjectHistory(
  kv: ConfigKv,
): Promise<HistoryEntry[]> {
  const text = await kv.get(CONFIG_HISTORY_KEY, 'text');
  if (text === null) return [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ConfigInvalidError('not valid JSON', CONFIG_HISTORY_KEY);
  }
  const parsed = historySchema.safeParse(json);
  if (!parsed.success)
    throw new ConfigInvalidError(
      describeIssues(parsed.error),
      CONFIG_HISTORY_KEY,
    );
  return parsed.data;
}

export async function readProjectConfig(
  kv: ConfigKv,
): Promise<StoredProjectConfig> {
  const config = await readStored(kv);
  if (!config) throw new ConfigMissingError();
  return config;
}

/** 公開対象のみを共通の表示順(Tier → 配列順)で返す。実行時処理はこれを使う。 */
export async function readPublishedProjects(
  kv: ConfigKv,
): Promise<ProjectDefinition[]> {
  const { projects } = await readProjectConfig(kv);
  return sortProjectsByTier(
    projects.filter((project) => project.published),
    (project) => project.tier,
  );
}

/**
 * `expectedRevision` は呼び出し側が読んだ revision。値が未設定の初回 seed だけ `null`。
 * KV に compare-and-swap はないため、書き込み直前の読み直しで競合を検出する
 * (管理者 1 名の前提。読み直しと put の間の書き込みは検出できない)。
 * 置き換える revision は本体より先に履歴へ積む。本体の put が失敗しても
 * 履歴が欠けないようにするため(同じ revision の重複は除く)。
 */
export async function writeProjectConfig(
  kv: ConfigKv,
  input: {
    projects: unknown;
    expectedRevision: number | null;
    updatedBy: string;
    now?: Date;
  },
): Promise<StoredProjectConfig> {
  const { projects } = projectConfigSchema.parse({ projects: input.projects });
  const previous = await readStored(kv);
  const actual = previous?.revision ?? null;
  if (actual !== input.expectedRevision)
    throw new ConfigConflictError(input.expectedRevision, actual);
  const next = storedProjectConfigSchema.parse({
    revision: (actual ?? 0) + 1,
    updatedAt: (input.now ?? new Date()).toISOString(),
    updatedBy: input.updatedBy,
    projects,
  });
  if (previous) {
    const history = await readProjectHistory(kv);
    const entries = [
      previous,
      ...history.filter((entry) => entry.revision !== previous.revision),
    ].slice(0, HISTORY_LIMIT);
    await kv.put(CONFIG_HISTORY_KEY, JSON.stringify(entries));
  }
  await kv.put(CONFIG_KEY, JSON.stringify(next));
  return next;
}
