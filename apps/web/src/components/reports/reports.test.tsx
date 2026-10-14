import type { Report } from '@devpulse/domain/reports/model';
import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ReportOverview } from './ReportOverview.tsx';

const report: Report = {
  input: {
    date: '2026-10-13',
    start: '2026-10-12T15:00:00.000Z',
    end: '2026-10-13T15:00:00.000Z',
    capturedAt: '2026-10-14T12:00:00.000Z',
    missingProjects: 1,
    projects: [
      {
        repository: 'o/r',
        name: 'Project',
        fetchedAt: '2026-10-14T12:00:00.000Z',
        stale: true,
        closedIssues: 3,
        milestoneNumber: 1,
        progress: 60,
        progressDelta: null,
        health: '安定',
        deadline: '未設定',
      },
    ],
  },
  summary: '<script>alert(1)</script>\n3 件の Issue をクローズしました。',
  publishedAt: '2026-10-14T12:00:00.000Z',
  model: 'test',
  promptVersion: 1,
};

it('renders readable facts, source links and a plain-text AI summary', () => {
  const html = renderToString(<ReportOverview report={report} />);
  expect(html).toContain('3 件の Issue をクローズ');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('60%');
  expect(html).toContain('比較データなし');
  expect(html).toContain('古いデータ');
  expect(html).toContain('2026-10-14 21:00 JST');
  expect(html).toContain('href="https://github.com/o/r/milestone/1"');
  expect(html).toContain('href="/rss/reports.xml"');
  expect(html).toContain('href="/reports/2026-10-13/"');
});

it('shows the summary and archive link on the home page', () => {
  const html = renderToString(<ReportOverview compact report={report} />);
  expect(html).toContain('3 件の Issue をクローズ');
  expect(html).toContain('href="/reports/"');
  expect(html).not.toContain('<dl>');
});

it('keeps RSS discoverable before the first publication', () => {
  const html = renderToString(<ReportOverview report={null} />);
  expect(html).toContain('まだ公開されていません');
  expect(html).toContain('href="/rss/reports.xml"');
  expect(html).not.toContain('レポート全文');
});
