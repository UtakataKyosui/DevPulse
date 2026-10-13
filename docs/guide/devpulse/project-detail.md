# プロジェクト詳細ページ

`/projects/:slug/` に、プロジェクトごとの詳細ページを Rspress/MDX で配信します。

## 追加手順

1. `src/data/devpulse/projects.sample.json` にプロジェクトを定義する
2. `docs/projects/<slug>/index.mdx` を `docs/projects/devpulse/index.mdx` から複製し、`<ProjectDetail slug="...">` の `slug` と概要を書き換える
3. `docs/projects/_meta.json` に `{ "type": "dir", "name": "<slug>" }` と、`docs/projects/<slug>/_meta.json`(`["index"]`)を追加する

公開対象の slug に MDX ページがあることはテスト(`detail.test.tsx`)で検証します。

## 構成

- 見出し(概要・現在地・Milestones・Issue 進捗・最近の活動・次にやること・関連資料)は MDX 本文に置くため、Sidebar/TOC が維持されます。
- 変動データの部品(`ProjectStatus` / `MilestoneList` / `IssueThroughput` / `RecentActivity` / `NextActions`)は `ProjectDetail` が供給する `ProjectView` 由来のモデルを表示し、Home と同じ `toCardModel` を使うため進捗・Health・期限・同期日時は食い違いません。
- 説明文章は静的 HTML に含まれるため、API が不達でも読めます。データが無い場合は各部品が「進捗データを表示できません」を表示します。
- Snapshot に Issue 一覧は含まれないため、「次にやること」は未完了件数と GitHub Milestone への導線のみを示します。
- Issue 消化率は選択した Milestone の割合であり、開発全体の完成率ではありません。
