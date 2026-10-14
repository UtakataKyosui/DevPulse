---
description: データモデルの実装と運用のガイド
---

# データモデル

DevPulse は GitHub Milestones を進捗の **Single Source of Truth (SSOT)** とし、DevPulse 側には公開用メタデータだけを持ちます。実装は `packages/domain/src/devpulse/`、サンプルは `packages/domain/fixtures/` にあります。

## データ所有権

| 関心事 | 正本 | 方針 |
| --- | --- | --- |
| プロジェクト名、概要、URL | DevPulse 設定 | 手動管理 |
| 公開対象リポジトリ | DevPulse 設定 | 明示的 allowlist (`published: true`) |
| Milestone(名前、説明、期限、状態) | GitHub | API から同期 |
| Issue 状態・Milestone 所属 | GitHub | API から同期 |
| Progress | GitHub Milestone の Issue 消化率 | DevPulse 側で導出 |
| Health | DevPulse の判定規則 | 活動履歴から導出([算出ルール](./health-rules)) |
| Lifecycle | DevPulse 設定 | `planned` / `active` / `paused` / `completed` / `archived` |

Progress、Health、Lifecycle は互いに独立した値です。

## 進捗率の意味

```
progressPercent = closedIssues / (openIssues + closedIssues) * 100
```

- 件数が 0 の場合は `null`(未算出)。丸めは表示層で行います。
- これは **Milestone の Issue 消化率** であり、開発全体の完成率ではありません。
- GitHub の Milestone 集計値には PR が含まれ得ます。独自集計とは別物です。
- `milestone.state === "closed"` は `progressPercent === 100` を意味しません。
- 表示対象は `featuredMilestoneNumber` で明示した 1 件のみです。複数 Milestone の平均は算出しません。
- 未設定、存在しない、同期失敗の場合は `null`(未算出)とし、0 や 100 に補いません。
- Sub Issue の階層は進捗集計に使いません。

## 公開規則

- `published: true` のプロジェクトだけが表示データに含まれます。
- スナップショットの `visibility` が `public` でない(private)リポジトリは出力しません。
- 公開状態を検証できないプロジェクト(スナップショットが無い: 同期未実施・取得失敗)は、private の可能性があるため出力しません。リポジトリは大文字小文字を区別せず照合します。`visibility` は公開前検証用で、`toPublicView` が出力から除去します。
- GitHub のアクセストークンは成果物・クライアントに出力しません。正規化は未知のフィールドを破棄します。

## スナップショットファイル

`GET /api/snapshots`と KV `snapshots:v1` の本文は次の形式です。

| フィールド | 内容 |
| --- | --- |
| `schemaVersion` | 形式のバージョン(現在は `1`)。互換性のない変更では上げます |
| `lastSuccessAt` | 全リポジトリの取得に成功した最後の同期時刻。一部が失敗した同期では更新しません。未実施なら `null` |
| `snapshots` | リポジトリごとのスナップショット。各 `fetchedAt` がそのリポジトリの最終成功取得時刻です |

KV の反映遅延で古い内容が一時的に返っても、`lastSuccessAt` と `fetchedAt` で鮮度を判断できます。
導入前に保存した値は `schemaVersion` と `lastSuccessAt` を持たず、読み取り時に許容します。

## 主な API

| 名前 | パス |
| --- | --- |
| 型 `ProjectDefinition` `GitHubMilestoneSnapshot` `GitHubProjectSnapshot` `ProjectView` `Lifecycle` `HealthStatus` | `packages/domain/src/devpulse/types.ts` |
| `projectConfigSchema` `snapshotFileSchema` ほか | `packages/domain/src/devpulse/schema.ts` |
| `normalizeMilestones` `normalizeProjectSnapshot` | `packages/domain/src/devpulse/normalize.ts` |
| `selectFeaturedMilestone` | `packages/domain/src/devpulse/select-milestone.ts` |
| `calcProgressPercent` | `packages/domain/src/devpulse/progress.ts` |
| `buildProjectViews` `toPublicView` | `packages/domain/src/devpulse/build-views.ts` |
