import { Progress } from '@devpulse/ui/progress';
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
      <Progress
        className={`devpulse-gauge__track devpulse-progress--${tone}${percent === null ? ' devpulse-gauge__track--empty' : ''}`}
        value={percent}
        aria-label={progress.ariaLabel}
        aria-valuetext={progress.text}
      />
      <span className="devpulse-gauge__value" aria-hidden="true">
        {progress.text}
      </span>
    </div>
  );
}
