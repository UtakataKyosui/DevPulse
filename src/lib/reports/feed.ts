import type { Report } from './model.ts';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
}

/** Render feed content directly from saved facts, independent of the site theme. */
export function renderFeedContent(report: Report): string {
  const { input } = report;
  const summary = report.summary
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
  const projects = input.projects
    .map((project) => {
      const progress =
        project.progress === null ? '未設定・不明' : `${project.progress}%`;
      const delta =
        project.progressDelta === null
          ? '比較データなし'
          : `${project.progressDelta > 0 ? '+' : ''}${project.progressDelta} ポイント`;
      const source = `<a href="https://github.com/${project.repository}">${escapeHtml(project.repository)}</a>`;
      const milestone =
        project.milestoneNumber === null
          ? ''
          : ` / <a href="https://github.com/${project.repository}/milestone/${project.milestoneNumber}">Milestone</a>`;
      return `<h2>${escapeHtml(project.name)}</h2>
<ul>
<li>Issue クローズ: ${project.closedIssues} 件 / Milestone 進捗: ${progress} / 前回比: ${delta}</li>
<li>健全性: ${escapeHtml(project.health)} / 期限: ${escapeHtml(project.deadline)}</li>
<li>データ取得: ${escapeHtml(project.fetchedAt)}${project.stale ? '（古いデータ）' : ''}</li>
<li>出典: ${source}${milestone}</li>
</ul>`;
    })
    .join('\n');
  return `<p>対象期間: ${input.date} 00:00〜翌日 00:00（JST）。集計: ${escapeHtml(input.capturedAt)}。</p>
<h2>AI 要約</h2>
${summary}
<p>AI による要約です。数値と出典を確認してください。Milestone・健全性・期限は集計時点の状態です。</p>
${projects || '<p>利用できる公開データがありません。</p>'}
${input.missingProjects ? `<p>データを確認できない公開対象: ${input.missingProjects} 件。</p>` : ''}`;
}
