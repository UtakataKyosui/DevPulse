import { createContext, type ReactNode, useContext } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent } from '../ui/card.tsx';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../ui/chart.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table.tsx';
import { buildDetailModel, type DetailModel } from './detail-model.ts';
import { LoadNotice } from './LoadNotice.tsx';
import { ProgressGauge } from './ProgressGauge.tsx';
import { useProjectViews } from './use-project-views.ts';

import './dashboard.css';

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542v-2.094c-3.13.68-3.79-1.328-3.79-1.328-.512-1.301-1.25-1.647-1.25-1.647-1.022-.699.078-.685.078-.685 1.13.08 1.725 1.16 1.725 1.16 1.005 1.722 2.637 1.224 3.279.936.102-.728.393-1.224.715-1.505-2.499-.284-5.126-1.25-5.126-5.565 0-1.23.44-2.233 1.16-3.02-.116-.285-.503-1.43.11-2.98 0 0 .945-.302 3.094 1.154A10.79 10.79 0 0 1 12 6.178c.956.004 1.919.129 2.818.379 2.148-1.456 3.091-1.154 3.091-1.154.615 1.55.228 2.695.112 2.98.722.787 1.159 1.79 1.159 3.02 0 4.327-2.631 5.278-5.138 5.557.404.35.766 1.042.766 2.1v3.07c0 .3.203.65.774.54A11.25 11.25 0 0 0 12 .75Z" />
    </svg>
  );
}

const DetailContext = createContext<DetailModel | null>(null);

/** MDX 本文の見出し(TOC 対象)を保ったまま、配下の部品へ ProjectView 由来のモデルを渡す */
export function ProjectDetail({
  slug,
  children,
}: {
  slug: string;
  children?: ReactNode;
}) {
  const { views, state } = useProjectViews();
  const view = views.find((v) => v.definition.slug === slug);
  return (
    <DetailContext.Provider value={view ? buildDetailModel(view) : null}>
      <div className="devpulse-detail">
        <LoadNotice state={state} />
        {children}
      </div>
    </DetailContext.Provider>
  );
}

function Unavailable() {
  return (
    <p className="devpulse-detail__unavailable" role="status">
      進捗データを表示できません(未同期、または非公開・取得失敗)。
    </p>
  );
}

export function ProjectOverview() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  const { card, repositoryUrl } = model;
  return (
    <dl className="devpulse-card__meta devpulse-detail__overview">
      <dt>名称</dt>
      <dd>{card.name}</dd>
      <dt>説明</dt>
      <dd>{card.description}</dd>
      <dt>Lifecycle</dt>
      <dd>{card.lifecycleLabel}</dd>
      <dt>Repository</dt>
      <dd>
        <Badge
          render={<a href={repositoryUrl} />}
          variant="outline"
          className="max-w-full gap-2 px-3 py-1 text-sm whitespace-normal"
        >
          <GitHubIcon />
          <span className="min-w-0 break-all">
            {repositoryUrl.replace('https://', '')}
          </span>
        </Badge>
      </dd>
    </dl>
  );
}

export function ProjectStatus() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  const { card } = model;
  return (
    <>
      <dl className="devpulse-card__meta devpulse-detail__status">
        <dt>Milestone</dt>
        <dd>{card.milestoneTitle ?? '未設定'}</dd>
        <dt>Issue消化率</dt>
        <dd>
          <ProgressGauge progress={card.progress} tone={card.health.tone} />
          {card.emptyMessage && (
            <span className="devpulse-card__empty">{card.emptyMessage}</span>
          )}
        </dd>
        <dt>Health</dt>
        <dd>
          <Badge className={`devpulse-tone--${card.health.tone}`}>
            <span aria-hidden="true">{card.health.icon} </span>
            {card.health.label}
          </Badge>
        </dd>
        <dt>期限</dt>
        <dd className={`devpulse-deadline--${card.deadline.status}`}>
          {card.deadline.text}
        </dd>
        <dt>最終Commit</dt>
        <dd>{card.lastCommitText}</dd>
        <dt>最終同期</dt>
        <dd>
          {model.fetchedText ?? '未同期'}
          {card.stale && (
            <Badge variant="outline" className="devpulse-badge--stale">
              <span aria-hidden="true">⚠ </span>
              データが古い
            </Badge>
          )}
        </dd>
      </dl>
      <p className="devpulse-detail__note">
        Issue消化率は選択した Milestone の Issue
        に対する割合で、開発全体の完成率ではありません。
      </p>
    </>
  );
}

export function MilestoneList() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  if (model.milestones.length === 0) {
    return (
      <p className="devpulse-detail__unavailable">Milestone はありません。</p>
    );
  }
  return (
    <Table aria-label="Milestone 一覧">
      <TableHeader>
        <TableRow>
          <TableHead>Milestone</TableHead>
          <TableHead>状態 / 期限</TableHead>
          <TableHead>Issue</TableHead>
          <TableHead className="min-w-32">進捗</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {model.milestones.map((m) => (
          <TableRow key={m.number}>
            <TableCell className="font-medium">
              <a href={m.href}>{m.title}</a>
              {m.featured && (
                <Badge variant="secondary" className="ml-2">
                  現在地
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{m.stateLabel}</Badge>
              <div className="text-xs text-muted-foreground mt-1">
                {m.dueText}
              </div>
            </TableCell>
            <TableCell>{m.issueText}</TableCell>
            <TableCell>
              <ProgressGauge
                progress={m.progress}
                tone={model.card.health.tone}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function IssueThroughput() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  const { rows, totalClosed, closedDays } = model.throughput;
  return (
    <>
      <p className="devpulse-detail__summary">
        直近 7 日間: <strong>{totalClosed} 件 Close</strong> · 活動 {closedDays}{' '}
        日<small>PR を除く</small>
      </p>
      <Card className="py-4 gap-0">
        <CardContent className="px-3">
          <ChartContainer
            config={{
              count: { label: 'Close 件数', color: 'var(--rp-c-brand)' },
            }}
            className="h-44 w-full aspect-auto"
            aria-label="直近7日間の Issue Close 件数"
          >
            <BarChart
              accessibilityLayer
              data={rows}
              margin={{ left: -24, right: 8, top: 8 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(date: string) =>
                  date.slice(5).replace('-', '/')
                }
                tickLine={false}
                axisLine={false}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
          <details className="text-xs text-muted-foreground mt-2">
            <summary>日別の件数</summary>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日付</TableHead>
                  <TableHead>Close 件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{d.date}</TableCell>
                    <TableCell>{d.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </CardContent>
      </Card>
    </>
  );
}

export function RecentActivity() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  return (
    <>
      <p className="devpulse-detail__summary">
        最終Commit: {model.card.lastCommitText}
      </p>
      {model.recentClosures.length === 0 ? (
        <p>同期済みの最近 Close された Issue はありません。</p>
      ) : (
        <Table aria-label="最近の活動">
          <TableHeader>
            <TableRow>
              <TableHead>Issue</TableHead>
              <TableHead>日付</TableHead>
              <TableHead>活動</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.recentClosures.map((c) => (
              <TableRow key={c.number}>
                <TableCell>
                  <a href={c.href}>#{c.number}</a>
                </TableCell>
                <TableCell>
                  <time dateTime={c.closedDate}>{c.closedDate}</time>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">Close</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

export function NextActions() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  const { nextActions } = model;
  return (
    <p>
      {nextActions.title && <strong>{nextActions.title}: </strong>}
      {nextActions.message}
      {nextActions.href && (
        <>
          {' '}
          <Button
            variant="outline"
            size="sm"
            render={<a href={nextActions.href} />}
          >
            GitHub で開く
            <GitHubIcon />
          </Button>
        </>
      )}
    </p>
  );
}
