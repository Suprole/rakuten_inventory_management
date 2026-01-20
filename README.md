# 楽天2店舗ミラー在庫管理システム

本リポジトリは、仕様書 `楽天_2_店舗ミラー在庫管理システム_仕様書兼設計書（sheets_gas_gcs_next.md` に基づく実装一式です。

## 構成

- `frontend/`: Next.js（閲覧UI + 発注作成UI）
- `gas/`: Google Apps Script（ETL + 書き込みAPI、clasp管理）
- `docs/`: 運用/デプロイ等のドキュメント

## 方針（確定事項）

- **View配信**：GCSに `view/*.json` を配置し、**GCS直読み（`storage.googleapis.com`）** で配信
- **GCSアップロード**：GASから **サービスアカウント方式** でアップロード
- **在庫計算**：在庫は **metro固定**、windyは **ミラーずれ検知専用**

## ドキュメント

- 運用手順：`docs/ops.md`
- デプロイ（Vercel）：`docs/deploy-vercel.md`
