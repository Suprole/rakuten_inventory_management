## 運用手順（楽天2店舗ミラー在庫管理システム）

このドキュメントは、日次運用と障害時の切り分け手順をまとめたものです。

### 前提（構成）
- **SoT（正）**: Google Sheets（マスタ＋発注＋参照元の楽天在庫/売上シート）
- **ETL**: Google Apps Script（`runDailyEtl`）
- **閲覧**: Next.js（`frontend/`）
- **View配信**: GCS（`view/*.json`）

### 初期セットアップ（1回だけ）
- **(1) マスタ用スプレッドシート**
  - `gas/src/setup.gs` の `setupMasterSpreadsheet()` を実行
  - `config_sources` に metro/windy の参照先（Spreadsheet ID / シート名）を設定
  - 必要に応じて
    - `syncListingsFromRakutenSheets()`
    - `syncBomFromListingsSemiAuto()`
- **(2) 参照先の楽天シート（metro/windy）**
  - 必須列が揃っていること（例：`商品管理番号`, `SKU番号`, `在庫数`, `先月売上個数`, `今月売上個数`）
  - もし整形が必要なら `setupRakutenDataSheet(spreadsheetId, sheetName)` を利用
- **(3) GAS Script Properties**
  - `GCS_VIEW_BUCKET`
  - `GCS_SERVICE_ACCOUNT_JSON`
  - `API_KEY`（PO API用）
- **(4) 整合性チェック**
  - Apps Scriptエディタで `validateSheetsSchema()` を実行し、必須列欠損が無いことを確認
- **(5) 定期実行（トリガー）**
  - `createDailyEtlTrigger()`（毎朝07:00 JST）

### 日次運用（毎日）
- **(1) ETL結果の確認**
  - `runDailyEtl` の実行ログ（Apps Script）で `ok: true` を確認
  - GCSに `view/item_metrics.json` / `view/mirror_mismatch.json` / `view/unmapped_listings.json` が更新されていること
- **(2) フロントで確認**
  - `/`（トップ）: 危険/警告/発注推奨の件数
  - `/monitor/mirror` : ミラーずれ件数と明細
  - `/items` : 在庫一覧（検索/フィルタ/ソート）
- **(3) 未マッピングSKU（BOM未登録）の対応**
  - `unmapped_listings.json` に出たSKUは `listings`/`bom` を整備して、翌日ETLで解消する

### ミラーずれが出たとき
- **(1) 原因切り分け**
  - 参照元の楽天シート（metro/windy）で該当 `商品管理番号` + `SKU番号` の在庫数を再確認
  - 楽天RMS上の在庫と一致しているか確認
- **(2) 対応**
  - 正しい在庫へ手動で修正（店舗間で一致させる）
  - 修正後、次回ETL（または手動で `runDailyEtl`）で解消を確認

### 発注（PO）運用
- **作成**
  - `/po/new` でドラフト作成
  - 作成後 `/po/{id}` に遷移し明細/根拠を確認
- **送信 / キャンセル**
  - `/po/{id}` で操作（`draft`のみ）
  - `sent` は送信済み（戻せない前提）

### 障害時のチェックリスト（よくある）
- **ETLが落ちる**
  - `validateSheetsSchema()` を実行して必須列が欠けていないか
  - `config_sources` の参照先ID/シート名が正しいか
  - `GCS_SERVICE_ACCOUNT_JSON` が正しいか（秘密鍵の改行や欠損）
  - Apps Scriptの実行ログ（403/401等）を確認
- **フロントがデータ取得に失敗**
  - `/api/view/*` のエラー（Nextサーバーログ）を確認
  - `GCP_SERVICE_ACCOUNT_JSON` / `GCS_VIEW_BUCKET` の設定
  - GCSオブジェクトが存在し更新されているか
- **PO APIが失敗**
  - `GAS_WEBAPP_URL` / `GAS_API_KEY`（Next側）と `API_KEY`（GAS側）が一致しているか
  - `po_header` / `po_lines` シートに必須列が揃っているか（`validateSheetsSchema()`）

