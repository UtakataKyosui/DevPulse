declare const __DEVPULSE_REPORT_DATES__: string[];

export function ReportList() {
  if (__DEVPULSE_REPORT_DATES__.length === 0)
    return <p>レポートはまだ公開されていません。</p>;
  return (
    <ul>
      {__DEVPULSE_REPORT_DATES__.map((date) => (
        <li key={date}>
          <a href={`/reports/${date}/`}>{date} 開発進捗レポート</a>
        </li>
      ))}
    </ul>
  );
}
