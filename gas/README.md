# GAS（ETL + WebApp API）

このディレクトリは **Google Apps Script を `clasp` で管理**します（GAS側コードは `.gs` の純JavaScript）。

## 方針（本プロジェクト前提）

 - **ETL（1日1回）**：Google Sheets → 計算 → **GCSへ `view/*.json` をアップロード（フロントはGCS直読み）**
- **書き込みAPI**：Next.js から発注（PO）を Sheets へ書き込み（`X-API-KEY`）
- **GCSアップロード認証**：サービスアカウント方式（JWT → OAuth2 token → GCS JSON API）

## Script Properties（GAS側の設定）

GASの「プロジェクトのプロパティ（スクリプトプロパティ）」に以下を設定します。

- `GCS_VIEW_BUCKET`: `rakuten-inventory-views-prod`
- `GCS_SERVICE_ACCOUNT_JSON`: サービスアカウントキーJSON（文字列）
  - `client_email` と `private_key` を含むもの
- `API_KEY`: PO API用（Next.jsサーバーから呼び出す）

## 整合性チェック（事故防止）

Apps Scriptエディタから以下を実行できます：

- `validateSheetsSchema()`: 必須タブ/必須列の欠損をチェック（欠損はfail）
- `runDailyEtl()`: ETL本体（Sheets→計算→GCSアップロード）

## セットアップ（開発者ローカル）

1. 依存導入

```bash
cd gas
npm i
```

2. claspログイン（ブラウザが必要）

```bash
npx clasp login
```

3. `.clasp.json` を作成（※コミットしません）

`.clasp.json` 例：

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "dist"
}
```

4. push

```bash
npm run push
```

## ディレクトリ

- `src/`: GASへpushするソース（`.gs` + `appsscript.json`）

## 運用

- `../docs/ops.md` を参照してください。
