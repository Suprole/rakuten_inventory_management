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

