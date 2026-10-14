import type { Env } from './sync.ts';

const LOCK_NAME = 'snapshot-sync';
/** Cron Trigger の実行上限(15 分)を超える長さにする。異常終了しても次の Cron までに失効する。 */
export const SYNC_LOCK_TTL_MS = 20 * 60_000;

export const SYNC_LOCK_TABLE_SQL = `CREATE TABLE IF NOT EXISTS sync_lock (
  name TEXT PRIMARY KEY,
  lease TEXT NOT NULL,
  lease_until INTEGER NOT NULL
)`;

/** 取得できなければ null。期限切れのリースは奪える。D1 の単一文で取得を判定する。 */
export async function acquireSyncLock(
  db: Env['REPORTS'],
  now: number,
): Promise<string | null> {
  await db.prepare(SYNC_LOCK_TABLE_SQL).run();
  const lease = crypto.randomUUID();
  const result = await db
    .prepare(`INSERT INTO sync_lock (name, lease, lease_until) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET lease = excluded.lease, lease_until = excluded.lease_until
    WHERE sync_lock.lease_until <= ?`)
    .bind(LOCK_NAME, lease, now + SYNC_LOCK_TTL_MS, now)
    .run();
  return result.meta.changes === 1 ? lease : null;
}

export async function releaseSyncLock(db: Env['REPORTS'], lease: string) {
  await db
    .prepare(
      'UPDATE sync_lock SET lease_until = 0 WHERE name = ? AND lease = ?',
    )
    .bind(LOCK_NAME, lease)
    .run();
}
