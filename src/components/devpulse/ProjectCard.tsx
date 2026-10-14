import { Badge } from '../ui/badge.tsx';
import { Card, CardContent, CardHeader } from '../ui/card.tsx';
import { MilestoneGauge } from './MilestoneGauge.tsx';
import type { CardModel } from './model.ts';
import { ProgressGauge } from './ProgressGauge.tsx';
import { isPriority, PRIORITY_LABELS, type Priority } from './priorities.ts';

export function ProjectCard({
  card,
  priority = card.priority,
  priorityDisabled = false,
  onPriorityChange,
}: {
  card: CardModel;
  priority?: Priority;
  priorityDisabled?: boolean;
  onPriorityChange?: (priority: Priority) => void;
}) {
  const { health } = card;
  return (
    <li>
      <Card className="devpulse-card gap-4 py-5">
        <CardHeader className="gap-2 px-0">
          <h3 className="devpulse-card__title">
            <a className="devpulse-card__link" href={card.href}>
              {card.name}
            </a>
          </h3>
          <p className="devpulse-card__desc">{card.description}</p>
        </CardHeader>
        <CardContent className="px-0">
          {onPriorityChange && (
            <label className="devpulse-card__priority">
              着手優先度
              <select
                aria-label={`${card.name}の着手優先度`}
                value={priority}
                disabled={priorityDisabled}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isPriority(value)) onPriorityChange(value);
                }}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="devpulse-card__badges">
            <Badge variant="outline">
              着手優先度: {PRIORITY_LABELS[priority]}
            </Badge>
            <Badge variant="secondary">Lifecycle: {card.lifecycleLabel}</Badge>
            <Badge className={`devpulse-tone--${health.tone}`}>
              <span aria-hidden="true">{health.icon} </span>
              Health: {health.label}
            </Badge>
            {card.stale && (
              <Badge variant="outline" className="devpulse-badge--stale">
                <span aria-hidden="true">⚠ </span>
                データが古い
              </Badge>
            )}
          </div>
          <dl className="devpulse-card__meta">
            <dt>Milestone</dt>
            <dd>{card.milestoneTitle ?? '—'}</dd>
            <dt>Issue消化率</dt>
            <dd>
              <ProgressGauge progress={card.progress} tone={health.tone} />
              {card.emptyMessage && (
                <span className="devpulse-card__empty">
                  {card.emptyMessage}
                </span>
              )}
            </dd>
            <dt>最終Commit</dt>
            <dd>{card.lastCommitText}</dd>
            <dt>期限</dt>
            <dd className={`devpulse-deadline--${card.deadline.status}`}>
              {card.deadline.text}
            </dd>
          </dl>
          {card.milestones.length > 0 && (
            <div className="devpulse-card__milestones">
              <h4>Milestones</h4>
              <MilestoneGauge milestones={card.milestones} tone={health.tone} />
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
