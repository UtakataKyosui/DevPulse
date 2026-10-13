import type { HealthTone, ProgressModel } from './model.ts';

interface Props {
  progress: ProgressModel;
  tone: HealthTone;
}

/** 長さ = Progress(Issue消化率)、色 = Activity Health。null は「—」で 0%/100% と区別する */
export function ProgressGauge({ progress, tone }: Props) {
  const { percent } = progress;
  return (
    <div className="devpulse-gauge">
      <div
        className={`devpulse-gauge__track${percent === null ? ' devpulse-gauge__track--empty' : ''}`}
        role="img"
        aria-label={progress.ariaLabel}
      >
        {percent !== null && (
          <div
            className={`devpulse-gauge__fill devpulse-tone--${tone}`}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      <span className="devpulse-gauge__value" aria-hidden="true">
        {progress.text}
      </span>
    </div>
  );
}
