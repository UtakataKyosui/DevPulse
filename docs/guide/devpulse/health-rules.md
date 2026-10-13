# 算出ルール

Progress、Activity Health、Issue Throughput、Deadline Status、データ鮮度は **互いに独立** した指標です。数値や状態が食い違っても矛盾ではありません(例: 進捗 90% で Health が stalled、期限超過でも Health は stable)。実装は `src/lib/devpulse/` の純粋関数で、現在時刻は `now` 引数で注入します。

## Activity Health

最新リモートコミットからの **Asia/Tokyo 暦日差**(同じ日 = 0 日、翌日 = 1 日)で判定します。時間差ではなく暦日差です。UTC 14:59:59 と 15:00:00 の間で日付が変わります。

| 経過日数 | Health | 色 |
| --- | --- | --- |
| 0〜2 日 | `stable` | 緑 |
| 3〜4 日 | `warning` | 黄 |
| 5 日以上 | `stalled` | 赤 |
| コミット未取得・不正値・未来日時 | `unknown` | グレー |

- `lastActivityAt` は **committer date を暫定採用** した「リモートで確認できた最新コミットの日時」です。**push された日時ではありません**。rebase や cherry-pick では実際の push より古い日付になり得ます。push イベントへ切り替える場合はデータの意味と型を変更します。
- 対象ブランチの範囲と取得手段は GitHub 同期(#7)で定めます。

## Lifecycle と Health

Health を評価するのは `lifecycle: active` のみです。それ以外は `health.evaluated: false`、`status: 'unknown'` で、`label` に Lifecycle の表示名を返します。`stalled` にはなりません。

| Lifecycle | label |
| --- | --- |
| `planned` | 計画中 |
| `paused` | 休止中 |
| `completed` | 完了 |
| `archived` | アーカイブ |

## Issue Throughput

- Issue の `closed_at` を Asia/Tokyo の日付に変換し、日ごとに「1 件以上 Close されたか」と件数を持ちます。
- `now` の JST 暦日を含む **直近 7 暦日**(古い順)を返し、0 件の日も `closed: false, count: 0` で含みます。`totalClosed` は 7 日の Close 件数、`closedDays` は Close があった日数です。
- `pull_request` フィールドを持つ項目は集計から除外します。
- `closed_at` に基づくスナップショット集計です。再オープンされた Issue の過去の Close イベントは復元できず、現在 Close 状態のものだけが対象になります。
- **Throughput は Health の判定要因ではありません**。Close が 0 件の日があっても開発停止とは断定せず、コミットが無くても Close があれば Throughput にだけ反映されます。

## Deadline Status

Milestone の `due_on` を使い、期限日との Asia/Tokyo 暦日差(`daysUntilDue`、超過は負)で判定します。

| status | 条件 |
| --- | --- |
| `completed` | Milestone が closed、または Issue があり未完了が 0 件(期限より優先) |
| `none` | Milestone 未選択、または期限未設定 |
| `overdue` | 期限日を過ぎている |
| `due_soon` | 期限まで `dueSoonDays` 日以内(当日を含む) |
| `on_track` | それ以外 |

`dueSoonDays` の既定値は暫定の **7 日**で、`buildProjectViews` の `dueSoonDays` オプションで変更できます。期限超過を Activity Health に結びつけません。

## データ鮮度

`fetchedAt` からの経過時間 `ageHours` と `stale` を返します。`staleAfterHours`(既定は暫定の 48 時間)を超える、snapshot が無い、日時が不正または未来の場合は `stale: true` です。画面は古いデータを「現在の状態」と誤認させないよう `stale` と `fetchedAt` を表示してください。

## 主な API

| 名前 | パス |
| --- | --- |
| `assessHealth` `calcElapsedDays` `classifyElapsedDays` | `src/lib/devpulse/health.ts` |
| `calcIssueThroughput` | `src/lib/devpulse/throughput.ts` |
| `assessDeadline` | `src/lib/devpulse/deadline.ts` |
| `assessFreshness` | `src/lib/devpulse/freshness.ts` |
| `toJstDate` `jstCalendarDayDiff` | `src/lib/devpulse/jst.ts` |
| `buildProjectViews(definitions, snapshots, { now, dueSoonDays?, staleAfterHours? })` | `src/lib/devpulse/build-views.ts` |
