import { buildProjectViews } from '@devpulse/domain/devpulse/build-views';
import { shiftJstDate, toJstDate } from '@devpulse/domain/devpulse/jst';
import { selectFeaturedMilestone } from '@devpulse/domain/devpulse/select-milestone';
import type {
  GitHubProjectSnapshot,
  ProjectDefinition,
} from '@devpulse/domain/devpulse/types';
import { z } from 'zod';

export const reportDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (date) =>
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date,
  );
const projectSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  name: z.string().max(200),
  fetchedAt: z.iso.datetime(),
  stale: z.boolean(),
  closedIssues: z.number().int().nonnegative(),
  milestoneNumber: z.number().int().nullable(),
  progress: z.number().min(0).max(100).nullable(),
  progressDelta: z.number().nullable(),
  health: z.string().max(100),
  deadline: z.string().max(100),
});
export const reportInputSchema = z.object({
  date: reportDateSchema,
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  capturedAt: z.iso.datetime(),
  missingProjects: z.number().int().nonnegative(),
  projects: z.array(projectSchema).max(100),
});
export const reportSchema = z.object({
  input: reportInputSchema,
  summary: z.string().trim().min(1).max(4000),
  publishedAt: z.iso.datetime(),
  model: z.string().max(200),
  promptVersion: z.literal(1),
});
export type ReportInput = z.infer<typeof reportInputSchema>;
export type Report = z.infer<typeof reportSchema>;

export function previousReportDate(now: Date): string {
  return shiftJstDate(toJstDate(now) ?? '', -1);
}

export function collectReportInput(
  date: string,
  definitions: ProjectDefinition[],
  snapshots: GitHubProjectSnapshot[],
  previous: ReportInput | null,
  now: Date,
): ReportInput {
  reportDateSchema.parse(date);
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 86400000);
  const fresh = snapshots.filter((s) => {
    const age = now.getTime() - Date.parse(s.fetchedAt);
    return age >= 0 && age < 48 * 3600000;
  });
  // Generation has just synchronized: any retained earlier capture indicates a failed refresh.
  const views = buildProjectViews(definitions, fresh, {
    now,
    staleAfterHours: 0,
  });
  return reportInputSchema.parse({
    date,
    start: start.toISOString(),
    end: end.toISOString(),
    capturedAt: now.toISOString(),
    missingProjects:
      definitions.filter((p) => p.published).length - views.length,
    projects: views.map((view) => {
      const snapshot = view.snapshot;
      if (!snapshot) throw new Error('Missing public snapshot');
      const milestone = selectFeaturedMilestone(view.definition, snapshot);
      const old =
        previous?.date === shiftJstDate(date, -1)
          ? previous.projects.find(
              (p) =>
                p.repository.toLowerCase() ===
                view.definition.repository.toLowerCase(),
            )
          : undefined;
      return {
        repository: view.definition.repository,
        name: view.definition.name,
        fetchedAt: snapshot.fetchedAt,
        stale: view.freshness.stale,
        closedIssues: snapshot.issueClosures.filter(
          (issue) =>
            !issue.isPullRequest &&
            Date.parse(issue.closedAt) >= start.getTime() &&
            Date.parse(issue.closedAt) < end.getTime(),
        ).length,
        milestoneNumber: milestone?.number ?? null,
        progress: view.progressPercent,
        progressDelta:
          old &&
          !old.stale &&
          !view.freshness.stale &&
          old.milestoneNumber === milestone?.number &&
          old.progress !== null &&
          view.progressPercent !== null
            ? Math.round((view.progressPercent - old.progress) * 100) / 100
            : null,
        health: view.health.label,
        deadline: view.deadline.status,
      };
    }),
  });
}

/** AI output and repository labels are always plain text, never executable MDX. */
export function escapeMarkdown(text: string): string {
  return text.replace(
    /[&<>"'{}\\`*_[\]()#!|~$]/g,
    (char) => `&#${char.charCodeAt(0)};`,
  );
}

export function renderReport(report: Report): string {
  const { input } = report;
  const lines = [
    '---',
    `title: ${JSON.stringify(`${input.date} 開発進捗レポート`)}`,
    `description: ${JSON.stringify(`${input.date} の公開プロジェクトの進捗と確認事項`)}`,
    `published_at: ${JSON.stringify(report.publishedAt)}`,
    '---',
    `# ${input.date} 開発進捗レポート`,
    '',
    `対象期間: ${input.date} 00:00〜翌日 00:00（JST）。集計時刻: ${input.capturedAt}。`,
    'Milestone・健全性・期限は集計時点の状態で、前日終了時点の状態ではありません。',
    '',
    '## AI 要約',
    '',
    escapeMarkdown(report.summary),
    '',
    'AI による要約です。数値と出典は以下の集計を確認してください。実装内容や今後の予定は推測しません。',
    '',
    '## プロジェクト別の集計',
    '',
    `データを確認できない公開対象: ${input.missingProjects} 件。`,
    '',
  ];
  if (input.projects.length === 0)
    lines.push('利用できる公開データがありません。');
  for (const project of input.projects) {
    lines.push(
      `### ${escapeMarkdown(project.name)}`,
      '',
      `- 対象期間内の Issue クローズ: ${project.closedIssues} 件${project.closedIssues === 0 ? '（クローズなし）' : ''}`,
      `- Milestone 進捗: ${project.progress === null ? '未設定・不明' : `${project.progress}%`}`,
      `- 前回比: ${project.progressDelta === null ? '不明（初回・比較対象変更・データ不足）' : `${project.progressDelta > 0 ? '+' : ''}${project.progressDelta} ポイント${project.progressDelta === 0 ? '（変化なし）' : ''}`}`,
      `- 健全性: ${escapeMarkdown(project.health)} / 期限: ${escapeMarkdown(project.deadline)}`,
      `- データ取得: ${project.fetchedAt}${project.stale ? '（古いデータ・部分的な取得失敗の可能性あり）' : ''}`,
      `- 出典: [${escapeMarkdown(project.repository)}](https://github.com/${project.repository})${project.milestoneNumber === null ? '' : ` / [Milestone](https://github.com/${project.repository}/milestone/${project.milestoneNumber})`}`,
      '',
    );
  }
  lines.push(
    `生成モデル: ${escapeMarkdown(report.model)} / プロンプト: v${report.promptVersion}`,
    '',
  );
  return lines.join('\n');
}
