/**
 * シート/列の整合性チェック（仕様：必須列欠損はfail）
 *
 * 使い方：
 * - Apps Scriptエディタで `validateSheetsSchema` を実行
 */
function validateSheetsSchema() {
  // master sheets
  var master = [
    { name: 'config_sources', required: ['store_id', 'spreadsheet_id', 'sheet_name'] },
    { name: 'items', required: ['internal_id', 'name', 'active'] },
    { name: 'listings', required: ['listing_id', 'store_id', 'rakuten_item_no', 'rakuten_sku', 'active'] },
    { name: 'listing_handling', required: ['listing_id', 'handling_status'] },
    { name: 'bom', required: ['listing_id', 'internal_id', 'qty'] },
    // Yahoo（CSVインポート）系
    { name: 'yahoo_listings', required: ['yahoo_listing_id', 'item_code', 'sub_code', 'active'] },
    { name: 'yahoo_bom', required: ['yahoo_listing_id', 'internal_id', 'qty'] },
    // CSV貼り付けタブ（ヘッダが正しいことを保証する。データ行は0でもOK）
    { name: 'yahoo_item_report_lm', required: ['商品コード', 'サブコード', '注文点数合計'] },
    { name: 'yahoo_item_report_cm', required: ['商品コード', 'サブコード', '注文点数合計'] },
    { name: 'po_header', required: ['po_id', 'created_at', 'status', 'supplier', 'note'] },
    { name: 'po_lines', required: ['po_id', 'line_no', 'internal_id', 'qty', 'unit_cost', 'basis_need_qty', 'basis_days_of_cover'] },
  ];

  for (var i = 0; i < master.length; i++) {
    var m = master[i];
    var values = readActiveSpreadsheetSheetValues(m.name);
    if (!values.length) throw new Error(m.name + ' is empty (no header)');
    var header = indexHeader(values[0]);
    requireCols(header, m.required, m.name);
  }

  // sources -> rakuten sheets
  var sources = readConfigSources_();
  var stores = ['metro', 'windy'];
  for (var s = 0; s < stores.length; s++) {
    var st = stores[s];
    var cfg = sources[st];
    var v = readSheetValues(cfg.spreadsheet_id, cfg.sheet_name);
    if (!v.length) throw new Error('rakuten sheet is empty: ' + st);
    var h = indexHeader(v[0]);
    requireCols(h, ['商品管理番号', 'SKU番号', '在庫数', '先月売上個数', '今月売上個数'], 'rakuten_sheet:' + st);
  }

  Logger.log('[validateSheetsSchema] ok');
  return { ok: true };
}

