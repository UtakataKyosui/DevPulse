# 管理者API

[README](../../../../README.md) | [開発スキル](../SKILL.md)

すべてのエンドポイントはAccessによる認証（`src/worker/admin-api.ts`）で保護され、
`Cache-Control: no-store`を返します。`POST` / `PUT` / `DELETE`では、
リクエスト元のオリジンと一致する`Origin`ヘッダーも必要です。

| エンドポイント | 動作 |
|---|---|
| `GET /api/admin/config` | 現在の`{ revision, updatedAt, updatedBy, projects }`を返す |
| `PUT /api/admin/config` | 本文は`{ revision, projects }`。古い`revision`は409。スキーマエラー、slug変更、非公開リポジトリは422と`errors: [{ path, message }]`を返す |
| `GET /api/admin/candidates` | 固定の所有者の未登録の公開リポジトリを返す。各候補に`defaults`（`published: false`、`tier: low`）を含む |
| `GET /api/admin/history` | 保持している置き換え済みリビジョンを新しい順で`{ revision, limit, entries: [{ revision, updatedAt, updatedBy, projectCount }] }`として返す |
| `GET /api/admin/history/<revision>` | 指定リビジョンの保存済みドキュメントに、`projectConfigSchema`と現在の設定に対するslugルールの`errors`を加えて返す。保持されていなければ404 |
| `POST /api/admin/history/<revision>/restore` | 本文の`{ revision }`には**現在の**リビジョンを指定。指定した過去のリビジョンのプロジェクトを新しいリビジョンとして保存する。`PUT`と同じ検証を行う（古い場合409、不正または非公開なら422、保持されていなければ404） |

所有者は`cloudflare.config.ts`の`ADMIN_SETTINGS.githubOwner`で設定します。
保存時には、新規追加または新たに公開するリポジトリを`GITHUB_TOKEN`を使ってGitHub APIで確認します。
新規追加するリポジトリは、その所有者に属している必要があります。復元時も同じ検証を行うため、
その後非公開になったリポジトリを再公開するリビジョンは拒否されます。
