import {
  type Report,
  type ReportInput,
  reportInputSchema,
  reportSchema,
} from '@devpulse/domain/reports/model';
import type { Env } from './sync.ts';

// IF NOT EXISTS allows both a fresh cf-provisioned D1 and existing deployments.
export const REPORT_TABLE_SQL = `CREATE TABLE IF NOT EXISTS daily_reports (
  date TEXT PRIMARY KEY,
  input TEXT,
  report TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  published_at TEXT
)`;

export class ReportStore {
  constructor(private db: Env['REPORTS']) {}
  async initialize() {
    await this.db.prepare(REPORT_TABLE_SQL).run();
  }

  async claim(date: string, now: number): Promise<string | null> {
    const lease = crypto.randomUUID();
    const result = await this.db
      .prepare(`INSERT INTO daily_reports (date, attempts, lease, lease_until)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(date) DO UPDATE SET attempts = attempts + 1, lease = excluded.lease, lease_until = excluded.lease_until
      WHERE report IS NULL AND lease_until <= ? AND attempts < 3`)
      .bind(date, lease, now + 10 * 60000, now)
      .run();
    return result.meta.changes === 1 ? lease : null;
  }

  async input(date: string): Promise<ReportInput | null> {
    const row = await this.db
      .prepare('SELECT input FROM daily_reports WHERE date = ?')
      .bind(date)
      .first<{ input: string | null }>();
    return row?.input ? reportInputSchema.parse(JSON.parse(row.input)) : null;
  }

  async saveInput(date: string, lease: string, input: ReportInput) {
    const result = await this.db
      .prepare(
        'UPDATE daily_reports SET input = COALESCE(input, ?) WHERE date = ? AND lease = ? AND report IS NULL',
      )
      .bind(JSON.stringify(input), date, lease)
      .run();
    if (result.meta.changes !== 1) throw new Error('Report lease lost');
  }

  async complete(date: string, lease: string, report: Report) {
    const result = await this.db
      .prepare(
        'UPDATE daily_reports SET report = ?, lease = NULL, lease_until = 0 WHERE date = ? AND lease = ? AND report IS NULL',
      )
      .bind(JSON.stringify(reportSchema.parse(report)), date, lease)
      .run();
    if (result.meta.changes !== 1) throw new Error('Report lease lost');
  }

  async release(date: string, lease: string) {
    await this.db
      .prepare(
        'UPDATE daily_reports SET lease = NULL, lease_until = 0 WHERE date = ? AND lease = ?',
      )
      .bind(date, lease)
      .run();
  }

  async resetAttempts(date: string, now: number) {
    await this.db
      .prepare(
        'UPDATE daily_reports SET attempts = 0 WHERE date = ? AND report IS NULL AND lease_until <= ?',
      )
      .bind(date, now)
      .run();
  }

  async get(date: string): Promise<Report | null> {
    const row = await this.db
      .prepare('SELECT report FROM daily_reports WHERE date = ?')
      .bind(date)
      .first<{ report: string | null }>();
    return row?.report ? reportSchema.parse(JSON.parse(row.report)) : null;
  }

  async list(after: string): Promise<Report[]> {
    const rows = await this.db
      .prepare(
        'SELECT report FROM daily_reports WHERE report IS NOT NULL AND date > ? ORDER BY date LIMIT 100',
      )
      .bind(after)
      .all<{ report: string }>();
    return rows.results.map((row) =>
      reportSchema.parse(JSON.parse(row.report)),
    );
  }

  async acknowledge(dates: string[], now: string) {
    if (dates.length === 0) return;
    await this.db.batch(
      dates.map((date) =>
        this.db
          .prepare(
            'UPDATE daily_reports SET published_at = COALESCE(published_at, ?) WHERE date = ? AND report IS NOT NULL',
          )
          .bind(now, date),
      ),
    );
  }
}
