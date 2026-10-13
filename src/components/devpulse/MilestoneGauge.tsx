import type { CardModel, HealthTone } from './model.ts';

export function MilestoneGauge({
  milestones,
  tone,
}: {
  milestones: CardModel['milestones'];
  tone: HealthTone;
}) {
  return (
    <div className="devpulse-milestone-gauge">
      <fieldset
        className="devpulse-milestone-gauge__track"
        aria-label="Milestone ごとの Issue 消化率"
      >
        {milestones.map((milestone, index) => (
          <a
            key={milestone.number}
            href={milestone.href}
            className={`devpulse-milestone-gauge__segment${milestone.progress.percent === null ? ' devpulse-gauge__track--empty' : ''}`}
            aria-label={`${index + 1}. ${milestone.title}: ${milestone.progress.ariaLabel}`}
            title={`${milestone.title}: ${milestone.progress.text} (${milestone.issueText})`}
          >
            {milestone.progress.percent !== null && (
              <span
                className={`devpulse-gauge__fill devpulse-tone--${tone}`}
                style={{ width: `${milestone.progress.percent}%` }}
              />
            )}
          </a>
        ))}
      </fieldset>
      <p className="devpulse-detail__note">
        各区画が1つの Milestone。区画内の塗りは Issue 消化率です。
      </p>
      <ol className="devpulse-milestone-gauge__labels">
        {milestones.map((milestone) => (
          <li key={milestone.number}>
            <a href={milestone.href}>{milestone.title}</a>
            <strong>{milestone.progress.text}</strong>
            <span className="devpulse-card__empty">{milestone.issueText}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
