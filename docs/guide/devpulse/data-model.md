# データモデル

DevPulse は GitHub Milestones を進捗の **Single Source of Truth (SSOT)** とし、DevPulse 側には公開用メタデータだけを持ちます。実装は `src/lib/devpulse/`、サンプルは `src/data/devpulse/` にあります。

## データ所有権

| 関心事 | 正本 | 方針 |
| --- | --- | --- |
| プロジェクト名、概要、URL | DevPulse 設定 | 手動管理 |
| 公開対象リポジトリ | DevPulse 設定 | 明示的 allowlist (`published: true`) |
| Milestone(名前、説明、期限、状態) | GitHub | API から同期 |
| Issue 状態・Milestone 所属 | GitHub | API から同期 |
| Progress | GitHub Milestone の Issue 消化率 | DevPulse 側で導出 |
| Health | DevPulse の判定規則 | 活動履歴から導出(詳細は #4) |
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
- スナップショットが無い(同期未実施・取得失敗)場合、プロジェクトは含まれますが `snapshot: null`、`progressPercent: null`、`health: 'unknown'` になります。`visibility` は公開前検証用で、`toPublicView` が出力から除去します。
- GitHub のアクセストークンは成果物・クライアントに出力しません。正規化は未知のフィールドを破棄します。

## 主な API

| 名前 | パス |
| --- | --- |
| 型 `ProjectDefinition` `GitHubMilestoneSnapshot` `GitHubProjectSnapshot` `ProjectView` `Lifecycle` `HealthStatus` | `src/lib/devpulse/types.ts` |
| `projectConfigSchema` `snapshotFileSchema` ほか | `src/lib/devpulse/schema.ts` |
| `normalizeMilestones` `normalizeProjectSnapshot` | `src/lib/devpulse/normalize.ts` |
| `selectFeaturedMilestone` | `src/lib/devpulse/select-milestone.ts` |
| `calcProgressPercent` | `src/lib/devpulse/progress.ts` |
| `buildProjectViews` `toPublicView` | `src/lib/devpulse/build-views.ts` |
