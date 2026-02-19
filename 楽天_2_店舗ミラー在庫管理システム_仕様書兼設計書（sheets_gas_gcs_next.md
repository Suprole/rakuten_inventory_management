# 楽天2店舗ミラー在庫管理システム
## 仕様書兼設計書（完全版）

> 本書は「何も知らないエンジニア」が読み、**寸分の狂いなく**想定通りのシステムを実装できる粒度で、背景・要件・データ構造・計算式・ETL・API・UI・運用までをすべて記載する。

---

## 1. 背景・目的

### 1.1 背景
- 楽天市場に **2店舗（metro / windy）** を運営している。
- 2店舗は **同一倉庫** を利用しており、在庫は実質的に共通。
- 楽天側には SKU（SKU番号）単位の在庫が存在し、店舗別に在庫が見えるが、運用上は **2店舗在庫がミラー（同じ値）** になっている。
- 既に「売上・在庫を毎日更新しているスプレッドシート」が存在し、これを基点に在庫状況を把握できる。

### 1.2 目的
- SKU/セット商品を考慮して **社内ID単位での需要（減少速度）・在庫余裕（在庫日数）・発注推奨数** を算出し、発注判断を支援する。
- 2店舗がミラー運用の前提のもと、**二重計上しない**。
- 画面は高速に動作し（一覧/検索/集計）、発注作成フローを実現する。

### 1.3 重要な前提（絶対条件）
1. **在庫の真実（Source of Truth）は楽天在庫（SKU在庫）**
   - 本システムは在庫を増減させて管理しない。
   - 毎日更新される楽天在庫（在庫数）をインポートし、それを真とする。
   - 入荷管理は本システムでは行わない（入荷は楽天在庫に反映されるため）。

2. **2店舗の在庫はミラー運用（同値）**
   - 在庫計算に用いる店舗は **metro固定** とする。
   - windyは監視用（ミラーずれ検知）にのみ用いる。

3. **売上データは「先月売上個数」「今月売上個数（途中値）」のみ**
   - 今月の経過日数はシートに存在しない。
   - よって **ETL実行日（JST）の当月日付** を経過日数 `d` とする。

4. **BOM（セット構成）**
   - 楽天の1SKU（販売単位）に対し、それを構成する複数の社内ID（在庫最小単位）が紐づく。
   - BOMは店舗間で同一。

---

## 2. スコープ

### 2.1 実装対象（必須）
- 商品一覧（社内ID軸）
- 商品詳細（社内ID軸）
- 発注作成（ドラフト作成〜送信済み管理）
- 集計（在庫日数・推奨発注量等）
- 検索（社内ID/商品名）
- ミラーずれ検知（metro vs windy）
- 1日1回のETL（GAS）
- GCSに計算済みView JSONを配置（フロントはそれを読む）

### 2.2 非対象（やらない）
- 在庫調整（棚卸し差分の管理）
- 入荷・検品・部分入荷の管理
- 楽天側在庫の自動更新（RMS在庫APIでの書き戻し等）
- 役割/権限管理

---

## 3. 全体アーキテクチャ

### 3.1 構成
- **データ基盤（SoT）**：Google Sheets
  - マスタ（社内商品/楽天SKU/セット構成）
  - 発注（PO）
  - 楽天在庫・売上（2店舗、同形式、同シート）

- **ETL（1日1回）**：Google Apps Script（時間主導トリガー）
  - Sheetsを一括読み込み
  - 計算（在庫/需要/発注推奨/ずれ検知）
  - **View JSON** を生成
  - **Google Cloud Storage（GCS）** にアップロード（上書き）

- **フロント**：Next.js（Vercel）
  - GCSのView JSONを取得して描画（高速）
  - 発注作成などの書き込みは GAS WebApp APIへ

- **API（書き込み）**：GAS WebApp（doGet/doPost）
  - PO作成・更新
  - （必要に応じて）View再生成トリガー

### 3.2 データフロー
1. 楽天在庫・売上が毎日更新される（既存運用）
2. GAS ETL（1日1回）がSheetsから全データを読み込む
3. GAS ETLがView JSONを生成しGCSへアップロード
4. Next.jsはGCSからView JSONを読み込んで画面表示
5. 発注作成はNext.js → GAS WebApp → Sheets（po_*タブへ書き込み）

### 3.3 パフォーマンス戦略
- Next.jsは計算済みのView JSONを読むだけ（DBクエリ不要）。
- JSONは社内ID約1000件＋ずれ検知数（通常少）で軽量。
- 取得はCDNキャッシュ（Vercel側 or GCSのキャッシュヘッダ）で高速化。

---

## 4. データモデル（Google SheetsをDBとする）

> 本章では「タブ名」「列名」「主キー」「一意制約」「必須/任意」をすべて定義する。

### 4.1 マスタ系

#### 4.1.1 `items`（社内商品マスタ：在庫最小単位）
- 用途：仕入れ値、ロット、安全在庫、リードタイムなど、発注判断の基準を持つ。

|列名|型|必須|例|説明|
|---|---|---:|---|---|
|internal_id|string|◯|ITM-000123|主キー（社内ID）|
|name|string|◯|デッキブラシ替えスポンジ|表示名|
|default_unit_cost|number|△|320|仕入れ値（初期値）|
|lot_size|number|△|50|ロット（発注単位）未設定は1|
|lead_time_days|number|△|14|納期（日）未設定は0|
|safety_stock|number|△|30|安全在庫 未設定は0|
|active|boolean|◯|TRUE|一覧表示・計算対象フラグ|

主キー：`internal_id`


#### 4.1.2 `listings`（楽天販売単位：店舗×SKU）
- 用途：売上/在庫シートのキーを、システム内部の1意ID（listing_id）へ正規化。

|列名|型|必須|例|説明|
|---|---|---:|---|---|
|listing_id|string|◯|metro\|12345\|SKU-01|主キー（推奨：`store_id|商品管理番号|SKU番号`）|
|store_id|enum|◯|metro|`metro` or `windy`|
|rakuten_item_no|string|◯|12345|商品管理番号|
|rakuten_sku|string|◯|SKU-01|SKU番号|
|title|string|△|…|表示用（任意）|
|active|boolean|◯|TRUE|計算対象フラグ|

一意制約（運用ルール）：`(store_id, rakuten_item_no, rakuten_sku)` は一意。


#### 4.1.3 `bom`（セット構成：SKU→社内ID）
- 用途：SKUが売れたとき/在庫が存在するときに、どの社内IDが何個分かを定義。

|列名|型|必須|例|説明|
|---|---|---:|---|---|
|listing_id|string|◯|metro\|12345\|SKU-01|FK → listings|
|internal_id|string|◯|ITM-000123|FK → items|
|qty|number|◯|2|SKU1個あたりに必要な社内ID数|

制約：
- `qty` は正の数（0不可）。
- 店舗間でBOMは同一前提だが、実装上はlisting_idが店舗別になるため、**両店舗のlisting_idに対して同じ構成を登録**するか、または「代表店舗のみ登録して参照する」方式を採る。
  - 本仕様では **両店舗のlisting_idに対してbomを持つ**（実装が単純で事故が少ない）。


### 4.2 入力データ（楽天在庫・売上）

#### 4.2.1 楽天在庫・売上シート（店舗別、同一形式、同一シート内）
- 2店舗それぞれに「在庫数」「先月売上個数」「今月売上個数」が同一シートに存在。
- 店舗の識別は「スプレッドシートID（もしくはシートID）」で行い、ETLで `store_id` を付与する。

必須列名（完全一致）：
- `商品管理番号`
- `SKU番号`
- `在庫数`
- `先月売上個数`
- `今月売上個数`


#### 4.2.2 `config_sources`（データソース設定）
> 店舗識別・読み取り対象をハードコードしないために必須。

|列名|型|必須|例|説明|
|---|---|---:|---|---|
|store_id|enum|◯|metro|`metro` or `windy`|
|spreadsheet_id|string|◯|1AbC…|売上/在庫シートのSpreadsheet ID|
|sheet_name|string|◯|data|対象タブ名|
|kind|enum|◯|rakuten_sheet|現仕様では固定（将来拡張用）|

備考：今回は「売上と在庫が同じシート」なので、店舗ごとに1行で足りる。


### 4.3 発注（PO）

#### 4.3.1 `po_header`
|列名|型|必須|例|説明|
|---|---|---:|---|---|
|po_id|string|◯|PO-20260120-001|主キー|
|created_at|string|◯|2026-01-20T09:00:00+09:00|作成日時（ISO）|
|status|enum|◯|draft|`draft` / `sent` / `cancelled`|
|supplier|string|△|A社|任意|
|note|string|△|…|任意|


#### 4.3.2 `po_lines`
|列名|型|必須|例|説明|
|---|---|---:|---|---|
|po_id|string|◯|PO-…|FK → po_header|
|line_no|number|◯|1|明細番号|
|internal_id|string|◯|ITM-000123|FK → items|
|qty|number|◯|100|発注数量（ロット丸め後）|
|unit_cost|number|△|315|今回の仕入れ値（未入力ならdefault_unit_cost）|
|basis_need_qty|number|△|83.2|丸め前need（根拠）|
|basis_days_of_cover|number|△|12.4|在庫日数（根拠）|


---

## 5. キー設計と同一判定

### 5.1 外部キー（楽天）
- 外部の同一判定キーは以下で固定：
  - `rakuten_key = 商品管理番号 + '|' + SKU番号`

### 5.2 店舗別キー
- `store_key = store_id + '|' + 商品管理番号 + '|' + SKU番号`

### 5.3 listing_id
- `listing_id = store_key` をそのまま採用。
- これによりJOINが単純化され、GASでMap構造を作りやすい。

---

## 6. 計算仕様（需要推定・在庫・リスク・発注推奨）

> 売上は「先月確定」「今月途中」しかないため、月初のブレを抑える混合推定を採用。

### 6.1 日付・日数の定義
- タイムゾーン：**Asia/Tokyo**
- ETL実行日：`today`（JST）
- 今月経過日数：`d = day(today)`（例：1/20なら20）
- 先月の日数：`Dprev = daysInMonth(previousMonth(today))`（28/30/31）


### 6.2 listing（SKU）単位の需要推定
入力（listing単位）：
- `LM` = `先月売上個数`
- `CM` = `今月売上個数`

計算：
- `r_prev = LM / Dprev`（先月ベース日次）
- `r_cur  = CM / d`（今月ペース日次、途中）

重み（今月の信頼度）：
- `w = min(0.7, d / 30)`

暴れ止め（必須）：
- `r_hat_raw = w*r_cur + (1-w)*r_prev`
- `r_hat = clamp(r_hat_raw, 0.5*r_prev, 2.0*r_prev)`

clamp定義：
- `clamp(x, lo, hi) = min(max(x, lo), hi)`

例外：
- `LM=0`の場合：
  - `r_prev=0` でclampが定義できないため、次のルール。
  - `r_hat = r_cur`（ただし `d` が小さすぎる場合の暴れ防止として `r_hat = min(r_cur, cap)` を入れてよい）
  - cap推奨：`cap = max(5, r_cur)`（運用で調整可）


### 6.3 internal（社内ID）単位の在庫・消費

#### 6.3.1 在庫（derived_stock）
- 在庫採用店舗：**metro固定**
- `stock_qty(listing)` は metroシートの `在庫数`。
- `derived_stock(internal_id) = Σ( stock_qty(listing) * bom.qty )`

#### 6.3.2 消費速度（avg_daily_consumption）
- `avg_daily_consumption(internal_id) = Σ( r_hat(listing) * bom.qty )`


### 6.4 在庫日数（days_of_cover）
- `days_of_cover = derived_stock / avg_daily_consumption`
- `avg_daily_consumption = 0` の場合：
  - `days_of_cover = Infinity`（表示は `∞`）


### 6.5 リスク判定（risk_level）
- `lead = lead_time_days`
- `buffer = 14`（固定）
- `target_cover_days = lead + buffer`
- `surplus_cover_days = 300`（固定）

判定：
- `dormant`：`derived_stock = 0` かつ `avg_daily_consumption = 0`（在庫も消費もない）
- `surplus`：`derived_stock > 0` かつ `days_of_cover >= surplus_cover_days`（`avg_daily_consumption = 0` の場合の `Infinity` も含む）
- `red`：`days_of_cover < lead`
- `yellow`：`lead <= days_of_cover < target_cover_days`
- `green`：`target_cover_days <= days_of_cover < surplus_cover_days`


### 6.6 発注推奨数量（reorder_qty_suggested）
- `safety = safety_stock`
- `lot = lot_size（未設定は1）`

need（丸め前）：
- `need_qty = avg_daily_consumption * target_cover_days + safety - derived_stock`

推奨数量：
- `reorder_qty_suggested = ceil(max(need_qty, 0) / lot) * lot`


---

## 7. ミラーずれ検知仕様

### 7.1 目的
- ミラー運用の前提が崩れると、metro固定採用が正しい在庫を表さなくなる。
- したがって、毎日ずれを検出して通知/可視化する。

### 7.2 同一判定
- 同一SKU判定は以下：
  - `rakuten_key = 商品管理番号 + '|' + SKU番号`

### 7.3 検知ロジック
- metro在庫 `S_metro` と windy在庫 `S_windy` を取得。
- `S_metro != S_windy` の場合、ずれとして抽出。

### 7.4 出力
- `view/mirror_mismatch.json` に配列で出力。
- UIで赤表示し、対応を促す。

---

## 8. ETL設計（GAS）

### 8.1 スケジュール
- 1日1回（推奨：午前7:00 JST）
- GAS「時間主導トリガー」で実行。

### 8.2 入力
- `config_sources`：各店舗のSpreadsheet ID / sheet_name
- `items`, `listings`, `bom`
- 各店舗の「楽天在庫・売上シート」

### 8.3 出力
- GCSへJSONファイルをアップロード（上書き）
  - `view/item_metrics.json`
  - `view/mirror_mismatch.json`
  - （任意）`view/listing_metrics.json`

### 8.4 一括取得の原則（性能要件）
- Sheets APIは**必ず範囲一括取得**（`getDataRange().getValues()`）。
- 行ごとの `getValue()` を禁止。
- 取得後、ヘッダ行を列インデックスMapに変換して参照。

### 8.5 ETL処理フロー（手順）

1) **設定読み込み**
- `config_sources` を読み込み、
  - metro / windy の (spreadsheet_id, sheet_name) を取得。

2) **マスタ読み込み**
- `items`, `listings`, `bom` を読み込み。
- `itemsMap[internal_id] = item`
- `listingsMap[listing_id] = {store_id, item_no, sku, active}`
- `bomByListing[listing_id] = [{internal_id, qty}, ...]`

3) **店舗別データ読み込み（在庫・売上）**
- metroシートを開き、必須列を取り出す：
  - `商品管理番号`, `SKU番号`, `在庫数`, `先月売上個数`, `今月売上個数`
- windyも同様。

4) **キー正規化（store_keyの生成）**
- 各行から
  - `listing_id = store_id + '|' + 商品管理番号 + '|' + SKU番号`
- これを用いて
  - `stockByListing[listing_id] = 在庫数`
  - `salesByListing[listing_id] = {LM, CM}`

5) **需要推定（listing単位 r_hat）**
- `today` をJSTで取得。
- `d = day(today)`
- `Dprev = daysInMonth(previousMonth(today))`
- 各listingで `r_hat` を計算。

6) **社内ID集計（derived_stock, avg_daily_consumption）**
- metro固定：在庫は metro の listing_id のみ採用。
- `derivedStock[internal_id] += stock_qty(listing)*bom.qty`
- `avgCons[internal_id] += r_hat(listing)*bom.qty`

7) **発注推奨計算（internal単位）**
- itemsの lead_time_days, safety_stock, lot_size を参照。
- need_qty, reorder_qty, days_of_cover, risk_level を計算。

8) **ミラーずれ検知**
- `rakuten_key` 単位で metro と windy を突合し、差分を抽出。

9) **View JSON生成**
- `item_metrics`：internal_idごとの行配列
- `mirror_mismatch`：ずれ行配列

10) **GCSアップロード**
- `view/item_metrics.json` と `view/mirror_mismatch.json` をアップロード。
- アップロード後、キャッシュ制御ヘッダを設定（推奨：max-age=300 など）。


### 8.6 エラーハンドリング
- 必須列が無い場合：ETL失敗（例外throw）
- 数値列が非数：0扱い＋警告ログ
- `bom` に存在しない listing が売上/在庫に出現：
  - 「未マッピングSKU」として別途ログ/JSONに吐く（任意だが推奨）
- `items` に無い internal_id が bomに存在：ETL失敗（マスタ整合性違反）

### 8.7 ログ
- GAS Logger に以下を出す：
  - 読み込み行数（metro/windy）
  - 有効listing数
  - bom行数
  - item_metrics行数
  - mismatch行数
  - 処理時間


---

## 9. GCS設計

### 9.1 バケット
- 例：`gs://rakuten-inventory-views`

### 9.2 オブジェクト構成
- `view/item_metrics.json`
- `view/mirror_mismatch.json`
- （任意）`view/listing_metrics.json`

### 9.3 公開方法
- 推奨：
  - 読み取り専用で公開（署名URLでも可）
  - Vercelから取得可能にする
- セキュリティ要件に応じ、
  - 公開バケット
  - 署名付きURL（GASが発行）
  - Cloud CDN
  のいずれかを採用。

（本仕様では実装簡易性を優先し、**読み取りのみ公開**を推奨）

---

## 10. API設計（GAS WebApp：書き込み）

### 10.1 目的
- Next.jsからPO作成/更新を行う。
- 在庫・売上の書き込みは行わない（それは既存運用で更新される）。

### 10.2 認証
- 権限管理は不要だが、外部公開は危険。
- 最低限、以下いずれか必須：
  1) 共有シークレット（ヘッダ `X-API-KEY`）
  2) Vercelサーバー経由でのみ呼べるようにする

本仕様では **X-API-KEY** を採用。

### 10.3 エンドポイント

#### 10.3.1 `POST /po/create`
- 概要：POドラフト作成
- 入力（JSON）：
  - `supplier`（任意）
  - `note`（任意）
  - `lines`: [{ `internal_id`, `qty`, `unit_cost?`, `basis_need_qty?`, `basis_days_of_cover?` }]
- 出力：
  - `po_id`

生成規則：
- `po_id = 'PO-' + YYYYMMDD + '-' + 3桁連番`
- 連番は当日分のpo_headerを走査して決定。


#### 10.3.2 `POST /po/update_status`
- 概要：POステータス更新
- 入力：`po_id`, `status`（draft/sent/cancelled）


#### 10.3.3 `GET /po/list`
- 概要：PO一覧取得
- 出力：po_header全行（必要なら絞り込み）


#### 10.3.4 `GET /po/detail?po_id=...`
- 概要：PO詳細取得
- 出力：po_header + po_lines


### 10.4 失敗時レスポンス
- `400`：入力不正
- `401`：APIキー不正
- `500`：シート書き込み失敗


---

## 11. フロントエンド設計（Next.js）

### 11.1 ページ一覧

#### 11.1.1 `/items`（社内ID一覧）
- データソース：`view/item_metrics.json`
- 機能：
  - 検索：`internal_id`, `name`
  - フィルタ：risk_level（red/yellow/green）, active
  - ソート：days_of_cover, reorder_qty_suggested, avg_daily_consumption, derived_stock
  - 行クリックで詳細へ
- 表示カラム（推奨）：
  - internal_id
  - name
  - derived_stock
  - avg_daily_consumption
  - days_of_cover
  - risk_level（色バッジ）
  - reorder_qty_suggested


#### 11.1.2 `/items/[internal_id]`（社内ID詳細）
- データソース：
  - item_metrics から該当行
  - （任意）listing_metricsからSKU内訳
- 表示：
  - 指標（在庫、消費、在庫日数、推奨発注）
  - 紐づくSKU（どのSKUが在庫/消費に寄与しているか）


#### 11.1.3 `/po/new`（発注作成）
- データソース：`item_metrics.json`
- ロジック：
  - `reorder_qty_suggested > 0` を候補として表示
  - 数量/単価を編集
  - 送信で `POST /po/create`


#### 11.1.4 `/po`（発注一覧）
- データソース：GAS API `GET /po/list`


#### 11.1.5 `/po/[po_id]`（発注詳細）
- データソース：GAS API `GET /po/detail`
- 操作：status更新（sent/cancelled）


#### 11.1.6 `/monitor/mirror`（ミラーずれ）
- データソース：`view/mirror_mismatch.json`
- ずれがあるSKUを一覧表示（赤）


### 11.2 データ取得・キャッシュ
- View JSONはSWRで取得（クライアントキャッシュ）
- 失敗時はリトライ、最後の成功値を表示。

推奨：
- `item_metrics.json` は5分キャッシュ（ETLは1日1回のため）


---

## 12. 運用手順

### 12.1 初期セットアップ
1. Google Sheetsにタブを作成：
   - `items`, `listings`, `bom`, `po_header`, `po_lines`, `config_sources`
2. `config_sources` に metro/windy の spreadsheet_id と sheet_name を入力
3. `items`, `listings`, `bom` を整備
4. GASプロジェクト作成
5. GCSバケット作成
6. GASにGCSアップロード用の認証設定（サービスアカウント or 署名付きURL方式）
7. ETL実行テスト → GCSにJSONが出ること確認
8. 時間主導トリガーを設定
9. Next.jsをVercelにデプロイし、GCSのJSONが読めること確認
10. GAS WebAppをデプロイし、PO作成が可能なこと確認


### 12.2 日次運用
- 楽天在庫・売上シートが更新される
- ETLが走りView更新
- 担当者は `/items` を見て赤/黄を確認し発注作成
- `/monitor/mirror` でミラーずれがあれば運用側で修正


---

## 13. テスト仕様（最低限）

### 13.1 単体テスト（ETL関数）
- `r_hat` の計算：
  - 月初（d=1〜3）でも暴れない
  - LM=0でも例外にならない
- BOM展開：
  - qtyが正しく掛け算される
- reorder_qty：
  - lot丸めが正しい

### 13.2 結合テスト
- metro/windyで在庫同値 → mismatchが0
- mismatchが出るケース → monitorで出る
- items/listings/bomの整合性が崩れた場合に適切に失敗する

### 13.3 受け入れテスト
- `items` 一覧が高速表示される
- 検索/ソートが正しく動く
- 発注作成→po_*に書き込まれる


---

## 14. 既知のエッジケースと対策

1) **BOM未登録のSKUが存在**
- 対策：未マッピング一覧をETLで出し、BOM整備を促す。

2) **LM=0で今月だけ売れている新商品**
- 対策：r_hatはr_curを採用（上限capは運用で調整）。

3) **今月途中値が異常に大きい（短期バズ）**
- 対策：clampで2倍までに抑制。

4) **在庫数が文字列/空欄**
- 対策：0扱い + 警告ログ。

5) **ミラーずれ**
- 対策：mismatch検知を必須機能としてUI表示。

---

## 15. 実装メモ（GASの推奨構造）

- `config.ts` 相当：
  - バケット名
  - APIキー
- `readSheet(spreadsheetId, sheetName)`：2次元配列取得
- `indexHeader(row0)`：列名→index Map
- `parseRakutenRows(values, storeId)`：store_key生成しstock/sales Map作成
- `computeDemand(LM, CM, d, Dprev)`：r_hat
- `aggregateToInternal()`：BOM展開
- `buildItemMetrics()`：risk/need/reorder
- `buildMirrorMismatch()`：metro vs windy
- `uploadToGCS(path, jsonString)`：アップロード


---

## 16. 変更容易性（将来拡張）
- 需要推定を「先月＋今月」から「過去Nヶ月」に拡張：
  - salesシート列追加 or 別シート化
- 在庫をミラーから分配へ変更：
  - policy導入（mirror_max/split_sum）
- 入荷/在庫調整の導入：
  - adjustmentテーブル追加
  - 在庫真実の定義を変更する必要あり（要要件再確認）

---

## 付録A：View JSONスキーマ

### A.1 `view/item_metrics.json`
```json
[
  {
    "internal_id": "ITM-000123",
    "name": "デッキブラシ替えスポンジ",
    "derived_stock": 120,
    "avg_daily_consumption": 3.2,
    "days_of_cover": 37.5,
    "lead_time_days": 14,
    "safety_stock": 30,
    "lot_size": 50,
    "target_cover_days": 28,
    "need_qty": 0,
    "reorder_qty_suggested": 0,
    "risk_level": "green"
  }
]
```

### A.2 `view/mirror_mismatch.json`
```json
[
  {
    "rakuten_item_no": "12345",
    "rakuten_sku": "SKU-01",
    "metro_stock_qty": 10,
    "windy_stock_qty": 8,
    "diff": 2
  }
]
```

---

## 付録B：最終チェックリスト
- [ ] 在庫・売上シートに必須列（商品管理番号/SKU番号/在庫数/先月売上個数/今月売上個数）が存在
- [ ] metro/windyの spreadsheet_id と sheet_name が `config_sources` に登録済み
- [ ] `items/listings/bom` が整備され、BOM未登録SKUが少ない
- [ ] GAS ETLが1日1回動き、GCSにJSONが生成される
- [ ] Next.jsがJSONを読み、一覧/検索/発注作成が動作
- [ ] ミラーずれが出た場合に monitor で検知できる

