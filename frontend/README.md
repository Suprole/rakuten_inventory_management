# Frontend（Next.js）

楽天2店舗ミラー在庫管理システムのフロントエンドです（閲覧UI + 発注UI）。

## 役割

- **閲覧（在庫/ミラーずれ）**: GCS上の `view/*.json` を **Next.js Route Handler経由**で取得
- **発注（PO）**: GAS WebAppへ **Next.jsサーバーから**中継（ブラウザにキーを出さない）

## 必要な環境変数

`.env.local`（ローカル）またはVercelの環境変数に設定します。

- **GCS View取得（非公開バケット）**
  - `GCS_VIEW_BUCKET`
  - `GCP_SERVICE_ACCOUNT_JSON`
- **GAS WebApp（PO API）**
  - `GAS_WEBAPP_URL`
  - `GAS_API_KEY`

例は `env.example` を参照してください。

## 開発（ローカル）

```bash
cd frontend
npm i
npm run dev
```

## ビルド確認

```bash
cd frontend
npm run lint
npm run build
```

## 運用

全体の運用は `../docs/ops.md` を参照してください。
