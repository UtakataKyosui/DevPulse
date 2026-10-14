import { z } from 'zod';

/** ETag と、その応答から同期に必要な項目だけを残した本文。次回の 304 でこの本文を使う。 */
export const ETAG_KEY = 'sync-etags:v1';

const entrySchema = z.object({
  etag: z.string().min(1),
  // z.unknown() would let an entry without a body through; a 304 would then return undefined.
  body: z.custom((value) => value !== undefined),
});
const fileSchema = z.record(z.string(), entrySchema);

export class EtagCache {
  private entries: Record<string, z.infer<typeof entrySchema>>;
  dirty = false;

  private constructor(entries: Record<string, z.infer<typeof entrySchema>>) {
    this.entries = entries;
  }

  /** 壊れた・古い形式の値は捨てて空から始める(条件付きリクエストを使わないだけ)。 */
  static parse(raw: unknown): EtagCache {
    const parsed = fileSchema.safeParse(raw);
    return new EtagCache(parsed.success ? parsed.data : {});
  }

  get(path: string) {
    return this.entries[path];
  }

  set(path: string, etag: string, body: unknown) {
    if (this.entries[path]?.etag === etag) return;
    this.entries[path] = { etag, body };
    this.dirty = true;
  }

  /** 同期対象から外れたリポジトリの項目を捨てる。 */
  retain(repositories: string[]) {
    const keep = new Set(repositories);
    for (const path of Object.keys(this.entries)) {
      const repository = path.split('/').slice(0, 2).join('/');
      if (!keep.has(repository)) {
        delete this.entries[path];
        this.dirty = true;
      }
    }
  }

  toJSON() {
    return this.entries;
  }
}
