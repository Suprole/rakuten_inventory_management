## Vercelデプロイ手順（Next.js）

このドキュメントは `frontend/` をVercelにデプロイする手順です。

### 1) 事前確認
- `frontend` で `npm run build` が通ること
- GAS側で `runDailyEtl()` が動き、GCSに `view/*.json` がアップロードされること
- GAS WebApp（PO API）がデプロイ済みであること（URLが取得できること）

### 2) Vercelプロジェクト作成
- Vercelで新規プロジェクト作成
- **Root Directory** を `frontend` に設定

### 3) 環境変数（Vercel）

Vercelの Project Settings → Environment Variables に以下を設定：

- **GCS View取得（非公開バケット）**
  - `GCS_VIEW_BUCKET`
  - `GCP_SERVICE_ACCOUNT_JSON`（サービスアカウントキーJSONを1行で貼り付け）
- **GAS WebApp（PO API）**
  - `GAS_WEBAPP_URL`（WebAppのURL）
  - `GAS_API_KEY`（GAS Script Properties `API_KEY` と同じ値）

### 4) デプロイ
- `main` ブランチ（または運用ブランチ）をデプロイ
- デプロイ後、以下のページが表示できることを確認
  - `/`（トップ）
  - `/items`
  - `/monitor/mirror`
  - `/po` / `/po/new`

### 5) キャッシュの考え方（簡易）
- ブラウザは `/api/view/*` を叩く（Nextサーバー側でGCSから取得）
- 画面側は「最後の成功値保持＋再試行」対応済み
- もし更新反映を優先するなら、現状の `cache: 'no-store'` を維持

### 6) トラブルシュート
- **Viewが取れない**
  - `GCP_SERVICE_ACCOUNT_JSON` の改行/欠損を疑う
  - バケット名 `GCS_VIEW_BUCKET` を確認
  - GCSに `view/item_metrics.json` 等が存在するか確認
- **POが失敗**
  - `GAS_WEBAPP_URL` が正しいか
  - `GAS_API_KEY` がGAS側 `API_KEY` と一致しているか

