/**
 * 初期セットアップ：マスタ用スプレッドシートに必要タブ/ヘッダを作成
 *
 * 想定：
 * - このGASが紐づいている「マスタ用スプレッドシート」を整備する
 * - 在庫/売上（metro/windy）は別スプレッドシートでもOK（config_sourcesで参照）
 */
function setupMasterSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.flush();

  // マスタタブ（仕様書のタブ名に合わせる）
  createOrResetHeader_(ss, 'config_sources', ['store_id', 'spreadsheet_id', 'sheet_name', 'kind']);
  createOrResetHeader_(ss, 'items', [
    'internal_id',
    'name',
    'default_unit_cost',
    'lot_size',
    'lead_time_days',
    'safety_stock',
    'active',
  ]);
  createOrResetHeader_(ss, 'listings', [
    'listing_id',
    'store_id',
    'rakuten_item_no',
    'rakuten_sku',
    'title',
    'active',
  ]);
  // BOM未紐付け監視の「取り扱い不可」管理（listing_id単位のフラグ）
  createOrResetHeader_(ss, 'listing_handling', [
    'listing_id',
    'store_id',
    'rakuten_item_no',
    'rakuten_sku',
    // 取り扱い不可にした時点の参考値（任意）
    'stock_qty',
    'last_month_sales',
    'this_month_sales',
    'handling_status', // normal / unavailable
    'note',
    'updated_at',
    'updated_by',
  ]);
  createOrResetHeader_(ss, 'bom', ['listing_id', 'internal_id', 'qty']);

  // Yahoo（CSVインポート）系
  // - Yahoo側の「商品コード|サブコード」を listing 相当のキーとして正規化し、BOMで internal_id に紐付ける
  // - ストアクリエイターの「商品別レポートCSV」を、そのまま貼れるようにインポート用タブを用意
  createOrResetHeader_(ss, 'yahoo_listings', [
    'yahoo_listing_id', // 推奨：商品コード + '|' + サブコード（サブコード無しの場合は商品コード）
    'item_code', // 商品コード
    'sub_code', // サブコード（オプション等）
    'name', // 商品名（任意：CSVから転記しても良い）
    'active',
  ]);
  createOrResetHeader_(ss, 'yahoo_bom', ['yahoo_listing_id', 'internal_id', 'qty']);

  // Yahoo「商品別レポート」CSVのヘッダ（2026-02 時点の例）
  // NOTE: ETLはこのうち「商品コード」「サブコード」「注文点数合計」を必須として参照する
  var yahooItemReportHeaders = [
    '商品名',
    '商品コード',
    'サブコード',
    '売上合計値（税込）',
    '注文数合計',
    '注文点数合計',
    '注文者数合計',
    '平均購買率',
    'お気に入り保存数',
    'カート投入数',
    'ページビュー（優良配送あり）',
    'ページビュー（優良配送なし）',
    '訪問者数',
    '貢献度（カテゴリ）',
  ];
  createOrResetHeader_(ss, 'yahoo_item_report_lm', yahooItemReportHeaders); // 先月分
  createOrResetHeader_(ss, 'yahoo_item_report_cm', yahooItemReportHeaders); // 今月分（途中）

  // 発注タブ（後続のPO実装で使う。先に枠だけ作る）
  createOrResetHeader_(ss, 'po_header', ['po_id', 'created_at', 'status', 'supplier', 'note']);
  createOrResetHeader_(ss, 'po_lines', [
    'po_id',
    'line_no',
    'internal_id',
    'qty',
    'unit_cost',
    'basis_need_qty',
    'basis_days_of_cover',
  ]);

  // 監査ログ（任意だが推奨）
  createOrResetHeader_(ss, 'audit_log', [
    'ts',
    'actor',
    'action',
    'entity_type',
    'entity_id',
    'before',
    'after',
    'note',
  ]);

  // config_sources の補助入力（例）
  seedConfigSourcesExample_(ss);

  SpreadsheetApp.flush();
  Logger.log('[setupMasterSpreadsheet] done: ' + ss.getUrl());
}

/**
 * 初期セットアップ：楽天「在庫・売上」シート（metro/windy側）のヘッダを作成/整形
 *
 * 使い方：
 * - metro/windyそれぞれのSpreadsheet IDとシート名（例: data）を入れて実行
 *
 * 注意：
 * - 既存シートにデータがある場合は、ヘッダ行（1行目）のみを上書きする可能性があります。
 *   既存運用シートに対しては、まず複製してから試すのを推奨します。
 */
function setupRakutenDataSheet(spreadsheetId, sheetName) {
  if (!spreadsheetId || !sheetName) throw new Error('spreadsheetId と sheetName は必須です');
  var ss = SpreadsheetApp.openById(String(spreadsheetId).trim());
  var name = String(sheetName).trim();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  // 必須列（仕様書の「完全一致」）
  var headers = ['商品管理番号', 'SKU番号', '在庫数', '先月売上個数', '今月売上個数'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  Logger.log('[setupRakutenDataSheet] done: ' + ss.getUrl() + ' #' + name);
}

/**
 * Yahoo商品バックアップCSV（daily_item_backup.csv）から yahoo_listings を作成/更新
 *
 * 使い方：
 * 1) `yahoo_listings` タブに daily_item_backup.csv を「そのまま」インポート（上書き）
 *    - 期待ヘッダ例: code, sub-code, name, display
 * 2) Apps Scriptでこの関数を実行
 * 3) `yahoo_listings` タブが正規化される（yahoo_listing_id,item_code,sub_code,name,active）
 *
 * 注意：
 * - 実行すると `yahoo_listings` タブの内容は「正規化テーブル」で上書きされます（CSVは残りません）
 * - ヘッダが既に正規化済みの場合は何もしません
 */
function syncYahooListingsFromDailyItemBackupCsv() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('yahoo_listings');
  if (!sheet) throw new Error('yahoo_listings sheet not found');

  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('yahoo_listings is empty (no header)');
  if (values.length < 2) throw new Error('yahoo_listings is empty (no data rows)');

  var header = indexHeader(values[0]);

  // 既に正規化済みなら何もしない
  var normalizedCols = ['yahoo_listing_id', 'item_code', 'sub_code', 'name', 'active'];
  var isNormalized = true;
  for (var nc = 0; nc < normalizedCols.length; nc++) {
    if (header[normalizedCols[nc]] === undefined) {
      isNormalized = false;
      break;
    }
  }
  if (isNormalized) {
    Logger.log('[syncYahooListingsFromDailyItemBackupCsv] yahoo_listings already normalized. skip');
    return { ok: true, skipped: true };
  }

  // raw CSV mode（daily_item_backup.csvのヘッダ）
  // 必須：code / sub-code / name
  requireCols(header, ['code', 'sub-code', 'name'], 'yahoo_listings(raw daily_item_backup.csv)');
  var codeIdx = header['code'];
  var subIdx = header['sub-code'];
  var nameIdx = header['name'];
  var displayIdx = header['display']; // 任意（無ければ全件true扱い）

  function normCode__(s) {
    // Yahooのコードは item_report / item_backup で大文字小文字が揺れるため、突合しやすいよう小文字に寄せる
    return toStringSafe(s).toLowerCase();
  }

  function extractSubCode__(raw) {
    // sub-code の表記揺れに対応：
    // - 通常: "2bf1063-n"
    // - ラベル付き: "内容量:80g=2bf1063-n"
    // ここでは「ラベルは残しつつ、実サブコード（=の右側）を返す」。
    // ただし '=' が無い場合はそのまま返す。
    var s = toStringSafe(raw);
    if (!s) return '';
    if (s.indexOf('=') < 0) return s;
    // '=' が複数あっても最後を採用（右端が実コードになりやすい）
    return toStringSafe(s.split('=').pop());
  }

  function extractLabel__(raw) {
    // "内容量:80g=2bf1063-n" -> "内容量:80g"
    var s = toStringSafe(raw);
    if (!s) return '';
    var idx = s.indexOf('=');
    if (idx < 0) return '';
    return toStringSafe(s.substring(0, idx));
  }

  function splitSubCodeParts__(rawSub) {
    // 例:
    // - "内容量:80g=2bf1063-n" -> ["内容量:80g=2bf1063-n"]
    // - "カラー:黄=...&カラー:赤=..." -> ["カラー:黄=...","カラー:赤=..."]
    var s = toStringSafe(rawSub);
    if (!s) return [''];
    // '&' 区切りで複数候補が入るケースに対応（Yahooのバリエーションが1セルに畳まれている）
    var parts = s.split('&');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = toStringSafe(parts[i]);
      if (!p) continue;
      out.push(p);
    }
    return out.length ? out : [''];
  }

  function makeYahooListingId__(itemCode, subCode) {
    var c = normCode__(itemCode);
    var s = normCode__(subCode);
    return s ? c + '|' + s : c;
  }

  // 集計（重複行があっても問題ないようにdedupe）
  var byId = {}; // yahoo_listing_id -> { item_code, sub_code, name, active }
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var itemCodeRaw = toStringSafe(row[codeIdx]);
    var itemCode = normCode__(itemCodeRaw);
    if (!itemCode) continue;
    var subRaw = toStringSafe(row[subIdx]);
    var nmBase = toStringSafe(row[nameIdx]);
    var active = displayIdx !== undefined ? toBooleanSafe(row[displayIdx]) : true;

    var parts = splitSubCodeParts__(subRaw);
    for (var pi = 0; pi < parts.length; pi++) {
      var part = parts[pi]; // "" あり得る
      var label = extractLabel__(part);
      var subCodeExtracted = extractSubCode__(part);
      var subCode = normCode__(subCodeExtracted);

      var yid = makeYahooListingId__(itemCode, subCode);
      if (!yid) continue;

      // name は「商品名 + (ラベル)」にして、画面/監視で判別しやすくする（任意）
      var nm = nmBase;
      if (label) {
        nm = nmBase ? nmBase + '（' + label + '）' : label;
      }

      if (!byId[yid]) {
        byId[yid] = { item_code: itemCode, sub_code: subCode, name: nm, active: active };
      } else {
        // 名前は空欄を補完、activeはOR（どこかで表示ならtrue）
        if (!byId[yid].name && nm) byId[yid].name = nm;
        byId[yid].active = byId[yid].active || active;
      }
    }
  }

  var rows = [];
  for (var y in byId) {
    var v = byId[y];
    rows.push([y, v.item_code || '', v.sub_code || '', v.name || '', v.active !== false]);
  }

  // 安定化：item_code → sub_code → yahoo_listing_id
  rows.sort(function (a, b) {
    var aCode = String(a[1] || '');
    var bCode = String(b[1] || '');
    if (aCode < bCode) return -1;
    if (aCode > bCode) return 1;
    var aSub = String(a[2] || '');
    var bSub = String(b[2] || '');
    if (aSub < bSub) return -1;
    if (aSub > bSub) return 1;
    return String(a[0] || '').localeCompare(String(b[0] || ''));
  });

  // 上書き（CSVは消えて正規化テーブルになる）
  var outHeader = ['yahoo_listing_id', 'item_code', 'sub_code', 'name', 'active'];
  sheet.clearContents();
  sheet.getRange(1, 1, 1, outHeader.length).setValues([outHeader]);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, outHeader.length).setValues(rows);
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, outHeader.length);

  Logger.log('[syncYahooListingsFromDailyItemBackupCsv] done: rows=' + rows.length);
  return { ok: true, rows: rows.length };
}

/**
 * yahoo_listings を参照して yahoo_bom をセットアップ（半自動）
 *
 * 目的：
 * - Yahooの売上（item_report）を internal_id に展開するために、yahoo_bom を「最低限の形」に整備する
 *
 * 使い方：
 * 1) `items` を整備（internal_idが入っていること）
 * 2) `yahoo_listings` を整備（syncYahooListingsFromDailyItemBackupCsv() 等）
 * 3) この関数を実行 → `yahoo_bom` に行が無い listing を追加（可能なら internal_id を自動補完）
 *
 * 自動補完ルール（保守的）：
 * - items.internal_id と yahoo_listings.sub_code が（大小文字無視で）一致 → internal_id=それ、qty=1
 * - 一致しない場合、items.internal_id と yahoo_listings.item_code が（大小文字無視で）一致 → internal_id=それ、qty=1
 * - それでも一致しない場合、internal_id空欄のプレースホルダ行を作る（人が後で埋める）
 *
 * 既存データの扱い：
 * - 既に同じ yahoo_listing_id の bom 行がある場合は保持
 * - ただし internal_id 空欄のプレースホルダ行があり、補完できる場合は補完する
 */
function syncYahooBomFromYahooListingsSemiAuto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  function normalizeKey_(s) {
    return toStringSafe(s).toLowerCase();
  }

  // SKU/社内id の末尾が `-N` 等の枝番を落として照合（楽天bomの半自動と同様）
  function normalizeSuffixKey_(s) {
    var x = toStringSafe(s);
    if (!x) return '';
    x = x.replace(/-[A-Za-z]$/, '');
    return x.toLowerCase();
  }

  // items 読み込み
  var itemsSheet = ss.getSheetByName('items');
  if (!itemsSheet) throw new Error('items sheet not found');
  var itemsValues = itemsSheet.getDataRange().getValues();
  if (itemsValues.length < 2) throw new Error('items is empty');
  var itemsHeader = indexHeader(itemsValues[0]);
  requireCols(itemsHeader, ['internal_id'], 'items');

  var internalIdByLower = {};
  var internalIdByLowerNoSuffix = {};
  for (var i = 1; i < itemsValues.length; i++) {
    var row = itemsValues[i];
    var internal_id = toStringSafe(row[itemsHeader['internal_id']]);
    if (!internal_id) continue;
    var k1 = internal_id.toLowerCase();
    if (!internalIdByLower[k1]) internalIdByLower[k1] = internal_id;
    var k2 = normalizeSuffixKey_(internal_id);
    if (k2 && !internalIdByLowerNoSuffix[k2]) internalIdByLowerNoSuffix[k2] = internal_id;
  }

  // yahoo_listings 読み込み
  var ylSheet = ss.getSheetByName('yahoo_listings');
  if (!ylSheet) throw new Error('yahoo_listings sheet not found');
  var ylValues = ylSheet.getDataRange().getValues();
  if (ylValues.length < 2) throw new Error('yahoo_listings is empty');
  var ylHeader = indexHeader(ylValues[0]);
  requireCols(ylHeader, ['yahoo_listing_id', 'item_code', 'sub_code'], 'yahoo_listings');

  // yahoo_bom 読み込み（ヘッダ無ければ作る）
  var ybSheet = ss.getSheetByName('yahoo_bom');
  if (!ybSheet) throw new Error('yahoo_bom sheet not found');
  var ybValues = ybSheet.getDataRange().getValues();
  if (ybValues.length < 1) ybValues = [[]];
  var ybHeader = ybValues.length ? indexHeader(ybValues[0]) : {};
  if (!ybHeader['yahoo_listing_id'] && ybValues.length === 1) {
    ybHeader = { yahoo_listing_id: 0, internal_id: 1, qty: 2 };
    ybSheet.getRange(1, 1, 1, 3).setValues([['yahoo_listing_id', 'internal_id', 'qty']]);
  } else {
    requireCols(ybHeader, ['yahoo_listing_id', 'internal_id', 'qty'], 'yahoo_bom');
  }

  // 既存BOMを listing_id 単位で収集
  var existingRowsByListing = {}; // yahoo_listing_id -> array of {internal_id, qty, rawRow}
  for (var b = 1; b < ybValues.length; b++) {
    var r0 = ybValues[b];
    var lid = toStringSafe(r0[ybHeader['yahoo_listing_id']]);
    if (!lid) continue;
    if (!existingRowsByListing[lid]) existingRowsByListing[lid] = [];
    existingRowsByListing[lid].push({
      internal_id: toStringSafe(r0[ybHeader['internal_id']]),
      qty: r0[ybHeader['qty']],
      raw: r0,
    });
  }

  // 出力行（既存 + 追加/補完）
  var outRows = [];

  // 既存をまずコピー
  for (var lid0 in existingRowsByListing) {
    var arr0 = existingRowsByListing[lid0];
    for (var k0 = 0; k0 < arr0.length; k0++) {
      var raw0 = arr0[k0].raw;
      outRows.push([
        toStringSafe(raw0[ybHeader['yahoo_listing_id']]),
        toStringSafe(raw0[ybHeader['internal_id']]),
        raw0[ybHeader['qty']],
      ]);
    }
  }

  // yahoo_listings 側を走査して、存在しない yahoo_listing_id は新規作成。存在する場合はプレースホルダ補完のみ。
  var seenListing = {};
  for (var l = 1; l < ylValues.length; l++) {
    var rowL = ylValues[l];
    var yahoo_listing_id = toStringSafe(rowL[ylHeader['yahoo_listing_id']]);
    if (!yahoo_listing_id) continue;
    if (seenListing[yahoo_listing_id]) continue;
    seenListing[yahoo_listing_id] = true;

    var itemCode = toStringSafe(rowL[ylHeader['item_code']]);
    var subCode = ylHeader['sub_code'] !== undefined ? toStringSafe(rowL[ylHeader['sub_code']]) : '';

    // まず sub_code → internal_id で照合（大小文字無視）
    var matchInternal = subCode ? (internalIdByLower[normalizeKey_(subCode)] || '') : '';
    if (!matchInternal && subCode) {
      var ksub2 = normalizeSuffixKey_(subCode);
      matchInternal = ksub2 ? (internalIdByLowerNoSuffix[ksub2] || '') : '';
    }
    // sub_codeで一致しない場合のみ、item_code → internal_id で照合
    if (!matchInternal && itemCode) {
      matchInternal = internalIdByLower[normalizeKey_(itemCode)] || '';
      if (!matchInternal) {
        var kcode2 = normalizeSuffixKey_(itemCode);
        matchInternal = kcode2 ? (internalIdByLowerNoSuffix[kcode2] || '') : '';
      }
    }

    var existing = existingRowsByListing[yahoo_listing_id];
    if (!existing || existing.length === 0) {
      // 新規行を追加（matchがあればinternal_id+qty=1、無ければ空欄）
      outRows.push([yahoo_listing_id, matchInternal || '', matchInternal ? 1 : '']);
      continue;
    }

    // 既存がある場合：internal_id空欄行があれば補完
    if (matchInternal) {
      for (var e = 0; e < existing.length; e++) {
        var ex = existing[e];
        if (!ex.internal_id) {
          // outRows内の該当行を探して更新（最初の空欄だけ）
          for (var o = 0; o < outRows.length; o++) {
            if (outRows[o][0] === yahoo_listing_id && !toStringSafe(outRows[o][1])) {
              outRows[o][1] = matchInternal;
              if (outRows[o][2] === '' || outRows[o][2] === null || outRows[o][2] === undefined) outRows[o][2] = 1;
              break;
            }
          }
          break;
        }
      }
    }
  }

  // 安定化：yahoo_listing_id → internal_id の順でソート（空欄は最後）
  outRows.sort(function (a, b) {
    var al = String(a[0] || '');
    var bl = String(b[0] || '');
    if (al < bl) return -1;
    if (al > bl) return 1;
    var ai = String(a[1] || '');
    var bi = String(b[1] || '');
    if (!ai && bi) return 1;
    if (ai && !bi) return -1;
    return ai.localeCompare(bi);
  });

  // 書き込み（ヘッダ固定、データは上書き）
  var headerRow = ['yahoo_listing_id', 'internal_id', 'qty'];
  ybSheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
  if (outRows.length) {
    ybSheet.getRange(2, 1, outRows.length, headerRow.length).setValues(outRows);
  }
  // 残骸行削除
  var last = ybSheet.getLastRow();
  var needed = 1 + outRows.length;
  if (last > needed) {
    ybSheet.getRange(needed + 1, 1, last - needed, headerRow.length).clearContent();
  }
  ybSheet.setFrozenRows(1);
  ybSheet.autoResizeColumns(1, headerRow.length);

  Logger.log('[syncYahooBomFromYahooListingsSemiAuto] done: rows=' + outRows.length);
  return { ok: true, rows: outRows.length };
}

/**
 * listings自動作成（同期）
 *
 * 前提：
 * - マスタ用スプレッドシートに `config_sources` と `listings` が存在している
 * - config_sources に metro/windy の (spreadsheet_id, sheet_name) が入っている
 * - 参照先シートに必須列：商品管理番号 / SKU番号 が存在している（在庫売上シートの形式）
 *
 * 挙動：
 * - metro/windy 両方の在庫売上シートを走査し、`store_id|商品管理番号|SKU番号` をlisting_idとして生成
 * - 既存の listings に同じ listing_id がある場合、title/active は可能な限り維持（空なら補完）
 * - 生成結果で listings を上書き（ヘッダ行は固定）
 */
function syncListingsFromRakutenSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // config_sources から参照先を読む
  var configValues = readActiveSpreadsheetSheetValues('config_sources');
  if (configValues.length < 2) throw new Error('config_sources is empty');
  var cfgHeader = indexHeader(configValues[0]);
  requireCols(cfgHeader, ['store_id', 'spreadsheet_id', 'sheet_name'], 'config_sources');

  var sources = {};
  for (var i = 1; i < configValues.length; i++) {
    var row = configValues[i];
    var store_id = toStringSafe(row[cfgHeader['store_id']]);
    if (store_id !== 'metro' && store_id !== 'windy') continue;
    var spreadsheet_id = toStringSafe(row[cfgHeader['spreadsheet_id']]);
    var sheet_name = toStringSafe(row[cfgHeader['sheet_name']]);
    if (!spreadsheet_id || !sheet_name) continue;
    sources[store_id] = { store_id: store_id, spreadsheet_id: spreadsheet_id, sheet_name: sheet_name };
  }
  if (!sources.metro || !sources.windy) throw new Error('config_sources must contain both metro and windy');

  // 既存listingsを読み（title/active保持用）
  var listingsSheet = ss.getSheetByName('listings');
  if (!listingsSheet) throw new Error('listings sheet not found');
  var existingValues = listingsSheet.getDataRange().getValues();
  var existingHeader = existingValues.length ? indexHeader(existingValues[0]) : {};
  // setupMasterSpreadsheet() が先に走っている前提
  requireCols(existingHeader, ['listing_id', 'store_id', 'rakuten_item_no', 'rakuten_sku', 'title', 'active'], 'listings');

  var existingById = {};
  for (var r = 1; r < existingValues.length; r++) {
    var ex = existingValues[r];
    var listing_id = toStringSafe(ex[existingHeader['listing_id']]);
    if (!listing_id) continue;
    existingById[listing_id] = {
      title: toStringSafe(ex[existingHeader['title']]),
      active: ex[existingHeader['active']],
    };
  }

  // 参照先（metro/windy）からSKU一覧を抽出
  var derived = {}; // listing_id -> { store_id, item_no, sku }
  // 参照先シートで「商品名」になり得る列名の候補（運用シートに合わせて増やせる）
  var titleHeaderCandidates = ['商品名', '商品名（商品名）', '商品名（タイトル）', '商品名（商品名・SKU）', '商品名（商品名/SKU）', '商品名（title）', '商品名（商品タイトル）', '商品タイトル', '商品名（管理用）'];
  var stores = ['metro', 'windy'];
  for (var s = 0; s < stores.length; s++) {
    var st = stores[s];
    var cfg = sources[st];
    var rakutenValues = readSheetValues(cfg.spreadsheet_id, cfg.sheet_name);
    if (rakutenValues.length < 2) continue;
    var rh = indexHeader(rakutenValues[0]);
    requireCols(rh, ['商品管理番号', 'SKU番号'], 'rakuten_sheet:' + st);
    // 商品名列は任意（見つかればtitleに入れる）
    var titleCol = undefined;
    for (var c = 0; c < titleHeaderCandidates.length; c++) {
      var colName = titleHeaderCandidates[c];
      if (rh[colName] !== undefined) {
        titleCol = rh[colName];
        break;
      }
    }

    for (var rr = 1; rr < rakutenValues.length; rr++) {
      var row2 = rakutenValues[rr];
      var itemNo = toStringSafe(row2[rh['商品管理番号']]);
      var sku = toStringSafe(row2[rh['SKU番号']]);
      if (!itemNo || !sku) continue;
      var id = makeListingId(st, itemNo, sku);
      var sheetTitle = titleCol !== undefined ? toStringSafe(row2[titleCol]) : '';
      derived[id] = {
        listing_id: id,
        store_id: st,
        rakuten_item_no: itemNo,
        rakuten_sku: sku,
        title: sheetTitle,
      };
    }
  }

  // 出力行を組み立て（既存の title/active を保持）
  var rows = [];
  for (var id2 in derived) {
    var d = derived[id2];
    var ex2 = existingById[id2];
    // 既存titleがあれば維持。空なら参照シートのtitleを採用。
    var title = ex2 && ex2.title ? ex2.title : d.title || '';
    var active = ex2 && ex2.active !== undefined && ex2.active !== '' ? ex2.active : true;
    rows.push([d.listing_id, d.store_id, d.rakuten_item_no, d.rakuten_sku, title, active]);
  }

  // 安定化：store_id→item_no→sku→listing_id順でソート
  rows.sort(function (a, b) {
    for (var k = 1; k <= 3; k++) {
      var av = String(a[k] || '');
      var bv = String(b[k] || '');
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return String(a[0] || '').localeCompare(String(b[0] || ''));
  });

  // シートへ反映（ヘッダ以外を上書き）
  var headerRow = ['listing_id', 'store_id', 'rakuten_item_no', 'rakuten_sku', 'title', 'active'];
  listingsSheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
  if (rows.length) {
    listingsSheet.getRange(2, 1, rows.length, headerRow.length).setValues(rows);
  }
  // 余分な古い行を消す（上書き後の残骸）
  var last = listingsSheet.getLastRow();
  var needed = 1 + rows.length;
  if (last > needed) {
    listingsSheet.getRange(needed + 1, 1, last - needed, headerRow.length).clearContent();
  }

  listingsSheet.setFrozenRows(1);
  listingsSheet.autoResizeColumns(1, headerRow.length);

  Logger.log('[syncListingsFromRakutenSheets] done: rows=' + rows.length);
}

/**
 * bom半自動作成（同期）
 *
 * 前提：
 * - `items` と `listings` と `bom` がマスタ用スプレッドシートに存在する
 *
 * 仕様：
 * - bom.listing_id は listings.listing_id をそのまま採用
 * - listings.rakuten_sku と items.internal_id が（大小文字無視で）完全一致する場合：
 *     internal_id = その値、qty = 1 を自動入力
 * - 上記で一致しない場合のみ、listings.rakuten_item_no（商品管理番号）と items.internal_id（社内id）が
 *   （大小文字無視で）完全一致する場合：
 *     internal_id = その値、qty = 1 を自動入力
 * - 一致しない場合：
 *     internal_id は空欄のまま（人が後で埋める）、qtyも空欄のまま
 *
 * 既存データの扱い（事故防止）：
 * - 既に同じlisting_idでbom行が存在する場合は基本的に保持
 * - ただし「internal_id空欄のプレースホルダ行」が存在し、かつ一致が取れる場合はその行を補完する
 */
function syncBomFromListingsSemiAuto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // SKU番号/社内id の末尾が `-N` のような場合に枝番を落として照合するための正規化
  function normalizeSkuSuffixKey_(s) {
    var x = String(s === null || s === undefined ? '' : s).trim();
    if (!x) return '';
    // 例: ABC- N のような空白は想定しない（シート上の値は通常連結されている前提）
    // 末尾が `-` + 英字1文字なら除去（大小文字は問わない）
    x = x.replace(/-[A-Za-z]$/, '');
    return x.toLowerCase();
  }

  // items読み込み（internal_idの集合）
  var itemsSheet = ss.getSheetByName('items');
  if (!itemsSheet) throw new Error('items sheet not found');
  var itemsValues = itemsSheet.getDataRange().getValues();
  if (itemsValues.length < 2) throw new Error('items is empty');
  var itemsHeader = indexHeader(itemsValues[0]);
  requireCols(itemsHeader, ['internal_id'], 'items');

  var internalIdByLower = {};
  var internalIdByLowerNoSuffix = {}; // 末尾 `-[A-Z]` を落としたキーでも引けるようにする
  for (var i = 1; i < itemsValues.length; i++) {
    var row = itemsValues[i];
    var internal_id = toStringSafe(row[itemsHeader['internal_id']]);
    if (!internal_id) continue;
    var key = internal_id.toLowerCase();
    // 重複があっても最初を採用（ログだけ）
    if (!internalIdByLower[key]) internalIdByLower[key] = internal_id;
    var key2 = normalizeSkuSuffixKey_(internal_id);
    if (key2 && !internalIdByLowerNoSuffix[key2]) internalIdByLowerNoSuffix[key2] = internal_id;
  }

  // listings読み込み
  var listingsSheet = ss.getSheetByName('listings');
  if (!listingsSheet) throw new Error('listings sheet not found');
  var listingsValues = listingsSheet.getDataRange().getValues();
  if (listingsValues.length < 2) throw new Error('listings is empty');
  var listingsHeader = indexHeader(listingsValues[0]);
  requireCols(listingsHeader, ['listing_id', 'rakuten_sku', 'rakuten_item_no'], 'listings');

  // bom読み込み（既存保持＆プレースホルダ補完）
  var bomSheet = ss.getSheetByName('bom');
  if (!bomSheet) throw new Error('bom sheet not found');
  var bomValues = bomSheet.getDataRange().getValues();
  if (bomValues.length < 1) bomValues = [[]];
  var bomHeader = bomValues.length ? indexHeader(bomValues[0]) : {};
  // setupMasterSpreadsheet()が作ったヘッダ前提
  if (!bomHeader['listing_id'] && bomValues.length === 1) {
    // ヘッダが無いケースは作る
    bomHeader = { listing_id: 0, internal_id: 1, qty: 2 };
    bomSheet.getRange(1, 1, 1, 3).setValues([['listing_id', 'internal_id', 'qty']]);
  } else {
    requireCols(bomHeader, ['listing_id', 'internal_id', 'qty'], 'bom');
  }

  // 既存BOMを listing_id 単位で収集
  var existingRowsByListing = {}; // listing_id -> array of {internal_id, qty, rawRow}
  for (var b = 1; b < bomValues.length; b++) {
    var r0 = bomValues[b];
    var lid = toStringSafe(r0[bomHeader['listing_id']]);
    if (!lid) continue;
    if (!existingRowsByListing[lid]) existingRowsByListing[lid] = [];
    existingRowsByListing[lid].push({
      internal_id: toStringSafe(r0[bomHeader['internal_id']]),
      qty: r0[bomHeader['qty']],
      raw: r0,
    });
  }

  // 出力行（既存 + 追加/補完）
  var outRows = [];

  // 既存をまずコピー（後でプレースホルダを補完してもここに反映されるよう、rawを使う）
  for (var lid0 in existingRowsByListing) {
    var arr0 = existingRowsByListing[lid0];
    for (var k0 = 0; k0 < arr0.length; k0++) {
      var raw0 = arr0[k0].raw;
      // bomヘッダ列数に合わせる（最低3列）
      outRows.push([
        toStringSafe(raw0[bomHeader['listing_id']]),
        toStringSafe(raw0[bomHeader['internal_id']]),
        raw0[bomHeader['qty']],
      ]);
    }
  }

  // listings側を走査して、存在しないlisting_idは新規作成。存在する場合はプレースホルダ補完のみ。
  var seenListing = {};
  for (var l = 1; l < listingsValues.length; l++) {
    var rowL = listingsValues[l];
    var listing_id = toStringSafe(rowL[listingsHeader['listing_id']]);
    if (!listing_id) continue;
    if (seenListing[listing_id]) continue;
    seenListing[listing_id] = true;

    var rakutenSku = toStringSafe(rowL[listingsHeader['rakuten_sku']]);
    var rakutenItemNo = toStringSafe(rowL[listingsHeader['rakuten_item_no']]); // 商品管理番号
    // まずSKU番号→社内idで照合（大小文字無視の完全一致）
    var matchInternal = rakutenSku ? internalIdByLower[rakutenSku.toLowerCase()] : '';
    // 追加：SKU番号/社内idが末尾 `-N`（`-[A-Z]`）のような場合、枝番を落として照合
    if (!matchInternal && rakutenSku) {
      var skuKey2 = normalizeSkuSuffixKey_(rakutenSku);
      matchInternal = skuKey2 ? (internalIdByLowerNoSuffix[skuKey2] || '') : '';
    }
    // SKUで一致しなかったものに対してのみ、商品管理番号→社内idで照合（大小文字無視の完全一致）
    if (!matchInternal && rakutenItemNo) {
      matchInternal = internalIdByLower[rakutenItemNo.toLowerCase()] || '';
    }

    var existing = existingRowsByListing[listing_id];
    if (!existing || existing.length === 0) {
      // 新規行を追加（matchがあればinternal_id+qty=1、無ければ空欄）
      outRows.push([listing_id, matchInternal || '', matchInternal ? 1 : '']);
      continue;
    }

    // 既存がある場合：internal_id空欄行があれば補完
    if (matchInternal) {
      for (var e = 0; e < existing.length; e++) {
        var ex = existing[e];
        if (!ex.internal_id) {
          // outRows内の該当行を探して更新（最初の空欄だけ）
          for (var o = 0; o < outRows.length; o++) {
            if (outRows[o][0] === listing_id && !toStringSafe(outRows[o][1])) {
              outRows[o][1] = matchInternal;
              // qtyが空なら1を入れる
              if (outRows[o][2] === '' || outRows[o][2] === null || outRows[o][2] === undefined) outRows[o][2] = 1;
              break;
            }
          }
          break;
        }
      }
    }
  }

  // 安定化：listing_id → internal_id の順でソート（空欄は最後）
  outRows.sort(function (a, b) {
    var al = String(a[0] || '');
    var bl = String(b[0] || '');
    if (al < bl) return -1;
    if (al > bl) return 1;
    var ai = String(a[1] || '');
    var bi = String(b[1] || '');
    if (!ai && bi) return 1;
    if (ai && !bi) return -1;
    return ai.localeCompare(bi);
  });

  // 書き込み（ヘッダ固定、データは上書き）
  var headerRow = ['listing_id', 'internal_id', 'qty'];
  bomSheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
  if (outRows.length) {
    bomSheet.getRange(2, 1, outRows.length, headerRow.length).setValues(outRows);
  }
  // 残骸行削除
  var last = bomSheet.getLastRow();
  var needed = 1 + outRows.length;
  if (last > needed) {
    bomSheet.getRange(needed + 1, 1, last - needed, headerRow.length).clearContent();
  }
  bomSheet.setFrozenRows(1);
  bomSheet.autoResizeColumns(1, headerRow.length);

  Logger.log('[syncBomFromListingsSemiAuto] done: rows=' + outRows.length);
}

/**
 * 毎日ETLの時間主導トリガーを作成（07:00 JST）
 *
 * - 既存の `runDailyEtl` トリガーがあれば削除して作り直します（重複事故防止）
 * - スクリプトのタイムゾーンは appsscript.json で Asia/Tokyo 前提
 */
function createDailyEtlTrigger() {
  deleteDailyEtlTriggers();
  ScriptApp.newTrigger('runDailyEtl').timeBased().atHour(7).everyDays(1).create();
  Logger.log('[createDailyEtlTrigger] created: runDailyEtl @ 07:00 JST');
}

/**
 * `runDailyEtl` の時間主導トリガーを削除（重複防止）
 */
function deleteDailyEtlTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    if (t.getHandlerFunction && t.getHandlerFunction() === 'runDailyEtl') {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  }
  Logger.log('[deleteDailyEtlTriggers] deleted: ' + count);
}

// ---------------- internal helpers ----------------

function createOrResetHeader_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  // 1行目にヘッダを入れる（既存運用を壊さないため、データ行は触らない）
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  // 見た目
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
}

function seedConfigSourcesExample_(ss) {
  var sheet = ss.getSheetByName('config_sources');
  if (!sheet) return;

  // 2行目以降が空なら例を入れる（上書きしない）
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) return;

  sheet.getRange(2, 1, 2, 4).setValues([
    // store_id, spreadsheet_id, sheet_name, kind
    ['metro', 'PASTE_METRO_SPREADSHEET_ID', 'data', 'rakuten_sheet'],
    ['windy', 'PASTE_WINDY_SPREADSHEET_ID', 'data', 'rakuten_sheet'],
  ]);
}

