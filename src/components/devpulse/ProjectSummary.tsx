import type { SummaryModel } from './model.ts';

const ITEMS: {
  key: keyof SummaryModel;
  label: string;
  tone: string;
  icon: string;
}[] = [
  { key: 'total', label: '総数', tone: 'total', icon: '' },
  { key: 'stable', label: '安定', tone: 'stable', icon: '✓' },
  { key: 'warning', label: '注意', tone: 'warning', icon: '▲' },
  { key: 'stalled', label: '停滞', tone: 'stalled', icon: '✕' },
  { key: 'paused', label: '休止', tone: 'inactive', icon: '–' },
  { key: 'unknown', label: '不明', tone: 'unknown', icon: '?' },
  { key: 'other', label: 'その他', tone: 'inactive', icon: '–' },
];

export function ProjectSummary({ summary }: { summary: SummaryModel }) {
  return (
    <ul className="devpulse-summary" aria-label="プロジェクト状態の集計">
      {ITEMS.map((item) => (
        <li
          key={item.key}
          className={`devpulse-summary__item devpulse-tone--${item.tone}`}
        >
          <span className="devpulse-summary__count">{summary[item.key]}</span>
          <span className="devpulse-summary__label">
            {item.icon && <span aria-hidden="true">{item.icon} </span>}
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
