import { expect, it } from 'vitest';
import { renderFeedContent } from './feed.ts';
import { collectReportInput, type Report } from './model.ts';

it('renders escaped plain text and facts using only basic feed HTML', () => {
  const report: Report = {
    input: collectReportInput(
      '2026-10-13',
      [],
      [],
      null,
      new Date('2026-10-14T12:00:00Z'),
    ),
    summary: '<script>alert(1)</script> & 要約\n\n第二段落',
    publishedAt: '2026-10-14T12:00:00.000Z',
    model: 'test',
    promptVersion: 1,
  };
  report.input.missingProjects = 1;
  report.input.projects = [
    {
      repository: 'o/r',
      name: '<img src=x>',
      fetchedAt: report.publishedAt,
      stale: true,
      closedIssues: 3,
      milestoneNumber: 1,
      progress: 0,
      progressDelta: null,
      health: '安定',
      deadline: '未設定',
    },
  ];
  const html = renderFeedContent(report);
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; 要約');
  expect(html).toContain('<p>第二段落</p>');
  expect(html).toContain('&lt;img src=x&gt;');
  expect(html).toContain('Issue クローズ: 3 件');
  expect(html).toContain('進捗: 0%');
  expect(html).toContain('比較データなし');
  expect(html).toContain('古いデータ');
  expect(html).toContain('確認できない公開対象: 1 件');
  expect(html).toContain('href="https://github.com/o/r/milestone/1"');
  expect(html).not.toMatch(/class=|id=|style=|<!--|<script|<img|href="#/);
  expect(
    [...html.matchAll(/<\/?([a-z0-9]+)/g)]
      .map((match) => match[1])
      .every((tag) => ['p', 'h2', 'ul', 'li', 'a'].includes(tag)),
  ).toBe(true);
});
