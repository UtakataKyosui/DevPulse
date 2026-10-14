import type { Report } from '@devpulse/domain/reports/model';
import { formatJstDateTime } from '../devpulse/model.ts';
import './reports.css';

declare const __DEVPULSE_LATEST_REPORT__: Report | null;

export function ReportOverview({
  compact = false,
  report = __DEVPULSE_LATEST_REPORT__,
}: {
  compact?: boolean;
  report?: Report | null;
}) {
  return (
    <section
      className={`rp-not-doc report-overview${compact ? ' report-overview--home' : ''}`}
      aria-label="最新の日次進捗レポート"
    >
      <div className="report-overview__heading">
        <div>
          <h2>最新の日次レポート</h2>
          <p>毎日 21:00 JST に生成・21:15 JST 頃に公開</p>
        </div>
        <a className="report-overview__subscribe" href="/rss/reports.xml">
          RSS を購読する ↗
        </a>
      </div>
      <p className="report-overview__hint">
        この画面でも内容を読めます。更新通知は RSS リーダーに{' '}
        <code>/rss/reports.xml</code> の URL を登録してください（最新 30 件）。
      </p>
      {report ? (
        <>
          <h3>
            <time dateTime={report.input.date}>{report.input.date}</time> の進捗
          </h3>
          <p className="report-overview__hint">
            対象: 当日 00:00〜翌日 00:00 JST / 集計:{' '}
            {formatJstDateTime(report.input.capturedAt)}
          </p>
          <div className="report-overview__summary">
            <strong>AI 要約</strong>
            <p>{report.summary}</p>
          </div>
          {!compact && (
            <>
              <p>
                Milestone・健全性・期限は集計時点の状態です。数値と出典を確認してください。
              </p>
              <div className="report-overview__projects">
                {report.input.projects.map((project) => (
                  <article
                    key={project.repository}
                    className="report-overview__project"
                  >
                    <h4>
                      <a href={`https://github.com/${project.repository}`}>
                        {project.name}
                      </a>
                    </h4>
                    <dl>
                      <div>
                        <dt>Issue クローズ</dt>
                        <dd>{project.closedIssues} 件</dd>
                      </div>
                      <div>
                        <dt>Milestone 進捗</dt>
                        <dd>
                          {project.progress === null
                            ? '不明・未設定'
                            : `${project.progress}%`}
                        </dd>
                      </div>
                      <div>
                        <dt>前回比</dt>
                        <dd>
                          {project.progressDelta === null
                            ? '比較データなし'
                            : `${project.progressDelta > 0 ? '+' : ''}${project.progressDelta} ポイント`}
                        </dd>
                      </div>
                      <div>
                        <dt>健全性 / 期限</dt>
                        <dd>
                          {project.health} / {project.deadline}
                        </dd>
                      </div>
                    </dl>
                    <p className="report-overview__hint">
                      取得: {formatJstDateTime(project.fetchedAt)}
                      {project.stale ? '（古いデータ）' : ''}
                    </p>
                    {project.milestoneNumber !== null && (
                      <a
                        href={`https://github.com/${project.repository}/milestone/${project.milestoneNumber}`}
                      >
                        Milestone を確認 ↗
                      </a>
                    )}
                  </article>
                ))}
              </div>
              {report.input.projects.length === 0 && (
                <p>利用できる公開データがありません。</p>
              )}
              {report.input.missingProjects > 0 && (
                <p>
                  データを確認できない公開対象: {report.input.missingProjects}{' '}
                  件
                </p>
              )}
            </>
          )}
          <div className="report-overview__links">
            <a href={`/reports/${report.input.date}/`}>
              レポート全文・出典を見る →
            </a>
          </div>
        </>
      ) : (
        <p>
          レポートはまだ公開されていません。初回公開後、ここに要約と集計が表示されます。
        </p>
      )}
      {compact && (
        <p>
          <a href="/reports/">すべてのレポートを見る →</a>
        </p>
      )}
    </section>
  );
}
