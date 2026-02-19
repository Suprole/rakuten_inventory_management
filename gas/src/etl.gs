function readConfigSources_() {
  var values = readActiveSpreadsheetSheetValues('config_sources');
  if (values.length < 2) throw new Error('config_sources is empty');
  var header = indexHeader(values[0]);
  requireCols(header, ['store_id', 'spreadsheet_id', 'sheet_name'], 'config_sources');

  var out = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var store_id = toStringSafe(row[header['store_id']]);
    if (store_id !== 'metro' && store_id !== 'windy') continue;
    var spreadsheet_id = toStringSafe(row[header['spreadsheet_id']]);
    var sheet_name = toStringSafe(row[header['sheet_name']]);
    if (!spreadsheet_id || !sheet_name) continue;
    out[store_id] = { store_id: store_id, spreadsheet_id: spreadsheet_id, sheet_name: sheet_name };
  }
  if (!out.metro || !out.windy) throw new Error('config_sources must contain both metro and windy');
  return out;
}

function readItems_() {
  var values = readActiveSpreadsheetSheetValues('items');
  if (values.length < 2) throw new Error('items is empty');
  var header = indexHeader(values[0]);
  requireCols(header, ['internal_id', 'name', 'active'], 'items');

  var out = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var internal_id = toStringSafe(row[header['internal_id']]);
    if (!internal_id) continue;
    out[internal_id] = {
      internal_id: internal_id,
      name: toStringSafe(row[header['name']]),
      default_unit_cost:
        header['default_unit_cost'] !== undefined
          ? toNumberSafeWarn(row[header['default_unit_cost']], 'items row=' + (i + 1) + ' internal_id=' + internal_id + ' col=default_unit_cost')
          : undefined,
      lot_size:
        header['lot_size'] !== undefined
          ? toNumberSafeWarn(row[header['lot_size']], 'items row=' + (i + 1) + ' internal_id=' + internal_id + ' col=lot_size')
          : undefined,
      lead_time_days:
        header['lead_time_days'] !== undefined
          ? toNumberSafeWarn(row[header['lead_time_days']], 'items row=' + (i + 1) + ' internal_id=' + internal_id + ' col=lead_time_days')
          : undefined,
      safety_stock:
        header['safety_stock'] !== undefined
          ? toNumberSafeWarn(row[header['safety_stock']], 'items row=' + (i + 1) + ' internal_id=' + internal_id + ' col=safety_stock')
          : undefined,
      active: toBooleanSafe(row[header['active']]),
    };
  }
  return out;
}

function readListings_() {
  var values = readActiveSpreadsheetSheetValues('listings');
  if (values.length < 2) throw new Error('listings is empty');
  var header = indexHeader(values[0]);
  requireCols(header, ['listing_id', 'store_id', 'rakuten_item_no', 'rakuten_sku', 'active'], 'listings');

  var out = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var listing_id = toStringSafe(row[header['listing_id']]);
    if (!listing_id) continue;
    out[listing_id] = {
      listing_id: listing_id,
      store_id: toStringSafe(row[header['store_id']]),
      rakuten_item_no: toStringSafe(row[header['rakuten_item_no']]),
      rakuten_sku: toStringSafe(row[header['rakuten_sku']]),
      title: header['title'] !== undefined ? toStringSafe(row[header['title']]) : undefined,
      active: toBooleanSafe(row[header['active']]),
    };
  }
  return out;
}

function readListingHandling_() {
  // listing_id -> { handling_status }
  // NOTE: listing_handling は運用で増えるため、最新行優先（同じlisting_idが複数ある場合は後勝ち）
  var values = readActiveSpreadsheetSheetValues('listing_handling');
  if (values.length < 2) return {};
  var header = indexHeader(values[0]);
  requireCols(header, ['listing_id', 'handling_status'], 'listing_handling');

  var out = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var listing_id = toStringSafe(row[header['listing_id']]);
    if (!listing_id) continue;
    var st = toStringSafe(row[header['handling_status']]) || 'normal';
    if (st !== 'normal' && st !== 'unavailable') st = 'normal';
    out[listing_id] = { handling_status: st };
  }
  return out;
}

function readBom_(itemsMap) {
  var values = readActiveSpreadsheetSheetValues('bom');
  if (values.length < 2) throw new Error('bom is empty');
  var header = indexHeader(values[0]);
  requireCols(header, ['listing_id', 'internal_id', 'qty'], 'bom');

  var out = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var listing_id = toStringSafe(row[header['listing_id']]);
    var internal_id = toStringSafe(row[header['internal_id']]);
    var qty = toNumberSafeWarn(row[header['qty']], 'bom row=' + (i + 1) + ' listing_id=' + listing_id + ' internal_id=' + internal_id + ' col=qty');
    if (!listing_id || !internal_id) continue;
    if (!itemsMap[internal_id]) throw new Error('bom references unknown internal_id: ' + internal_id);
    if (qty <= 0) throw new Error('bom qty must be > 0: listing_id=' + listing_id + ', internal_id=' + internal_id);
    if (!out[listing_id]) out[listing_id] = [];
    out[listing_id].push({ listing_id: listing_id, internal_id: internal_id, qty: qty });
  }
  return out;
}

function makeYahooListingId_(itemCode, subCode) {
  // Yahooのコードは大文字小文字が揺れるため、小文字に寄せて突合する
  var ic = toStringSafe(itemCode).toLowerCase();
  var sc = toStringSafe(subCode).toLowerCase();
  // サブコードが無いケースは商品コードのみをキーにする
  return sc ? ic + '|' + sc : ic;
}

function readYahooBom_(itemsMap) {
  // yahoo_listing_id -> [{ internal_id, qty }]
  var values = readActiveSpreadsheetSheetValues('yahoo_bom');
  if (values.length < 2) return {}; // 未整備でもETL自体は動かす（yahoo売上は0扱い）
  var header = indexHeader(values[0]);
  requireCols(header, ['yahoo_listing_id', 'internal_id', 'qty'], 'yahoo_bom');

  var out = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var yahoo_listing_id = toStringSafe(row[header['yahoo_listing_id']]);
    var internal_id = toStringSafe(row[header['internal_id']]);
    var qty = toNumberSafeWarn(
      row[header['qty']],
      'yahoo_bom row=' + (i + 1) + ' yahoo_listing_id=' + yahoo_listing_id + ' internal_id=' + internal_id + ' col=qty'
    );
    if (!yahoo_listing_id || !internal_id) continue;
    if (!itemsMap[internal_id]) throw new Error('yahoo_bom references unknown internal_id: ' + internal_id);
    if (qty <= 0) throw new Error('yahoo_bom qty must be > 0: yahoo_listing_id=' + yahoo_listing_id + ', internal_id=' + internal_id);
    if (!out[yahoo_listing_id]) out[yahoo_listing_id] = [];
    out[yahoo_listing_id].push({ yahoo_listing_id: yahoo_listing_id, internal_id: internal_id, qty: qty });
  }
  return out;
}

function readYahooListings_() {
  // yahoo_listing_id -> { item_code, sub_code, name, active }
  // NOTE: 導入途中を許容する（タブが無い/ヘッダが違う等はwarnして空で返す）
  try {
    var values = readActiveSpreadsheetSheetValues('yahoo_listings');
    if (values.length < 2) return {};
    var header = indexHeader(values[0]);
    requireCols(header, ['yahoo_listing_id', 'item_code', 'sub_code', 'name', 'active'], 'yahoo_listings');

    var out = {};
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var id = toStringSafe(row[header['yahoo_listing_id']]);
      if (!id) continue;
      out[id] = {
        yahoo_listing_id: id,
        item_code: toStringSafe(row[header['item_code']]),
        sub_code: toStringSafe(row[header['sub_code']]),
        name: toStringSafe(row[header['name']]),
        active: toBooleanSafe(row[header['active']]),
      };
    }
    return out;
  } catch (e) {
    Logger.log('[warn] yahoo_listings read failed: ' + (e && e.message ? e.message : String(e)));
    return {};
  }
}

function readYahooItemReportNormalized_(sheetName) {
  // Yahoo「商品別レポートCSV」を正規化して返す
  //
  // 背景：
  // - このCSVには「サブコードあり（明細行）」と「サブコード空欄（商品コード単位の集計行）」が混在する
  // - そのまま取り込むと、同一商品コードで二重計上になる
  //
  // 正規化ルール：
  // - ある商品コードにサブコード明細が1つでも存在する場合：明細行のみ採用（集計行は捨てる）
  // - 明細が存在しない商品コード：集計行のみ採用（キーは item_code のみ）
  //
  // 返却：
  // - salesByListing: yahoo_listing_id -> 注文点数合計
  // - metaByListing: yahoo_listing_id -> { item_code, sub_code, name }
  var values = readActiveSpreadsheetSheetValues(sheetName);
  if (!values.length) return { salesByListing: {}, metaByListing: {} };
  if (values.length < 2) return { salesByListing: {}, metaByListing: {} }; // ヘッダのみ

  var header = indexHeader(values[0]);
  requireCols(header, ['商品コード', 'サブコード', '注文点数合計'], sheetName);
  var nameIdx = header['商品名']; // 任意（無い場合も許容）

  function norm_(s) {
    return toStringSafe(s).toLowerCase();
  }
  function isEmptySub_(s) {
    // インポート状況により "NaN" が入ることがあるため空扱い
    return !s || s === 'nan';
  }

  // item_code -> group
  var byItem = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var itemCode = norm_(row[header['商品コード']]);
    if (!itemCode) continue;
    var subCode = norm_(row[header['サブコード']]);
    if (isEmptySub_(subCode)) subCode = '';
    var qty = toNumberSafeWarn(
      row[header['注文点数合計']],
      sheetName + ' row=' + (i + 1) + ' item_code=' + itemCode + ' sub_code=' + subCode + ' col=注文点数合計'
    );
    var nm = nameIdx !== undefined ? toStringSafe(row[nameIdx]) : '';

    if (!byItem[itemCode]) {
      byItem[itemCode] = {
        hasDetail: false,
        detail: [], // [{ sub_code, qty, name }]
        summaryQty: 0,
        summaryName: '',
      };
    }
    var g = byItem[itemCode];

    if (subCode) {
      g.hasDetail = true;
      g.detail.push({ sub_code: subCode, qty: qty, name: nm });
    } else {
      g.summaryQty += qty;
      if (!g.summaryName && nm) g.summaryName = nm;
    }
  }

  var salesByListing = {};
  var metaByListing = {};

  for (var itemCode in byItem) {
    var g2 = byItem[itemCode];
    if (g2.hasDetail) {
      // 明細行のみ採用（集計行は捨てる）
      for (var d = 0; d < g2.detail.length; d++) {
        var dr = g2.detail[d];
        var yid = makeYahooListingId_(itemCode, dr.sub_code);
        salesByListing[yid] = (salesByListing[yid] || 0) + (dr.qty || 0);
        if (!metaByListing[yid]) {
          metaByListing[yid] = { item_code: itemCode, sub_code: dr.sub_code, name: dr.name || '' };
        } else if (!metaByListing[yid].name && dr.name) {
          metaByListing[yid].name = dr.name;
        }
      }
    } else {
      // 集計行のみ採用（item_code単位）
      if (g2.summaryQty === 0 && !g2.summaryName) continue;
      var yid2 = makeYahooListingId_(itemCode, '');
      salesByListing[yid2] = (salesByListing[yid2] || 0) + (g2.summaryQty || 0);
      if (!metaByListing[yid2]) {
        metaByListing[yid2] = { item_code: itemCode, sub_code: '', name: g2.summaryName || '' };
      } else if (!metaByListing[yid2].name && g2.summaryName) {
        metaByListing[yid2].name = g2.summaryName;
      }
    }
  }

  return { salesByListing: salesByListing, metaByListing: metaByListing };
}

function readYahooItemReportSalesByListing_(sheetName) {
  return readYahooItemReportNormalized_(sheetName).salesByListing;
}

function readYahooItemReportMetaByListing_(sheetName) {
  return readYahooItemReportNormalized_(sheetName).metaByListing;
}

function aggregateYahooSalesToInternal_(salesByYahooListing, yahooBomByListing) {
  // internal_id -> salesQty
  var out = {};
  if (!salesByYahooListing) return out;
  for (var yahoo_listing_id in salesByYahooListing) {
    var qty = salesByYahooListing[yahoo_listing_id] || 0;
    if (qty === 0) continue;
    var refs = yahooBomByListing ? yahooBomByListing[yahoo_listing_id] : null;
    if (!refs || !refs.length) continue; // 未マッピングは0扱い（別途監視するなら追加）
    for (var i = 0; i < refs.length; i++) {
      var r = refs[i];
      out[r.internal_id] = (out[r.internal_id] || 0) + qty * (r.qty || 0);
    }
  }
  return out;
}

function readRakutenSheet_(cfg) {
  var values = readSheetValues(cfg.spreadsheet_id, cfg.sheet_name);
  if (values.length < 2) throw new Error('rakuten sheet is empty: ' + cfg.store_id);
  var header = indexHeader(values[0]);
  requireCols(header, ['商品管理番号', 'SKU番号', '在庫数', '先月売上個数', '今月売上個数'], 'rakuten_sheet:' + cfg.store_id);

  var stockByListing = {};
  var salesByListing = {};
  var stockByRakutenKey = {};

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rakuten_item_no = toStringSafe(row[header['商品管理番号']]);
    var rakuten_sku = toStringSafe(row[header['SKU番号']]);
    if (!rakuten_item_no || !rakuten_sku) continue;

    var ctxBase = 'rakuten_sheet:' + cfg.store_id + ' row=' + (i + 1) + ' item_no=' + rakuten_item_no + ' sku=' + rakuten_sku;
    var stock_qty = toNumberSafeWarn(row[header['在庫数']], ctxBase + ' col=在庫数');
    var LM = toNumberSafeWarn(row[header['先月売上個数']], ctxBase + ' col=先月売上個数');
    var CM = toNumberSafeWarn(row[header['今月売上個数']], ctxBase + ' col=今月売上個数');

    var listing_id = makeListingId(cfg.store_id, rakuten_item_no, rakuten_sku);
    stockByListing[listing_id] = stock_qty;
    salesByListing[listing_id] = { LM: LM, CM: CM };

    // 仕様書 7章：rakuten_key（商品管理番号|SKU番号）単位で突合するため
    var rk = makeRakutenKey(rakuten_item_no, rakuten_sku);
    stockByRakutenKey[rk] = stock_qty;
  }

  return { stockByListing: stockByListing, salesByListing: salesByListing, stockByRakutenKey: stockByRakutenKey };
}

function runEtlOnce() {
  var started = Date.now();

  // 1) 設定
  var sources = readConfigSources_();

  // 2) マスタ
  var itemsMap = readItems_();
  var listingsMap = readListings_();
  var listingHandling = readListingHandling_();
  var bomByListing = readBom_(itemsMap);
  var yahooBomByListing = readYahooBom_(itemsMap);
  var yahooListingsMap = readYahooListings_();

  // 3) 店舗別データ
  var metroData = readRakutenSheet_(sources.metro);
  var windyData = readRakutenSheet_(sources.windy);

  // 3.5) Yahoo（CSVインポート）売上（先月/今月）
  // - yahoo_item_report_lm/cm に貼られた「商品別レポート」から、注文点数合計を売上個数として採用
  var yahooLmByListing = {};
  var yahooCmByListing = {};
  var yahooLmMetaByListing = {};
  var yahooCmMetaByListing = {};
  try {
    yahooLmByListing = readYahooItemReportSalesByListing_('yahoo_item_report_lm');
    yahooCmByListing = readYahooItemReportSalesByListing_('yahoo_item_report_cm');
    yahooLmMetaByListing = readYahooItemReportMetaByListing_('yahoo_item_report_lm');
    yahooCmMetaByListing = readYahooItemReportMetaByListing_('yahoo_item_report_cm');
  } catch (eYahoo) {
    // Yahooタブが未作成/ヘッダ違いの場合でも、楽天側のETLは止めない（導入途中を許容）
    Logger.log('[warn] yahoo item report read failed: ' + (eYahoo && eYahoo.message ? eYahoo.message : String(eYahoo)));
    yahooLmByListing = {};
    yahooCmByListing = {};
    yahooLmMetaByListing = {};
    yahooCmMetaByListing = {};
  }
  var yahooSalesLmByInternal = aggregateYahooSalesToInternal_(yahooLmByListing, yahooBomByListing);
  var yahooSalesCmByInternal = aggregateYahooSalesToInternal_(yahooCmByListing, yahooBomByListing);

  // 4) 日付（需要推定）
  var today = getJstToday();
  var d = getDayOfMonthJst(today);
  var prev = getPrevMonthYearMonthJst(today);
  var Dprev = daysInMonth(prev.year, prev.month1to12);

  // 5) listing需要推定（全listing分）
  var rHatByListing = {};
  var allSalesByListing = {};
  for (var k1 in metroData.salesByListing) allSalesByListing[k1] = metroData.salesByListing[k1];
  for (var k2 in windyData.salesByListing) allSalesByListing[k2] = windyData.salesByListing[k2];
  for (var listing_id in allSalesByListing) {
    var sales = allSalesByListing[listing_id];
    rHatByListing[listing_id] = computeDemandRHat({ LM: sales.LM, CM: sales.CM, d: d, Dprev: Dprev });
  }

  // 6) internal集計（metro固定、二重計上しない）
  var derivedStock = {};
  var avgCons = {};
  var bomByInternal = {};
  var yahooBomByInternal = {};
  // store別 売上（社内ID単位、BOM展開後）
  var metroSalesLmByInternal = {};
  var metroSalesCmByInternal = {};
  var windySalesLmByInternal = {};
  var windySalesCmByInternal = {};

  // BOMを internal_id → listing で逆引きできるようにしておく（詳細画面のSKU別表示に利用）
  for (var listingIdForBom in bomByListing) {
    var rowsForListing = bomByListing[listingIdForBom];
    if (!rowsForListing) continue;
    for (var bidx = 0; bidx < rowsForListing.length; bidx++) {
      var br = rowsForListing[bidx];
      if (!bomByInternal[br.internal_id]) bomByInternal[br.internal_id] = [];
      bomByInternal[br.internal_id].push({ listing_id: br.listing_id, qty: br.qty });
    }
  }

  // Yahoo BOMも internal_id → yahoo_listing で逆引き（詳細画面のYahoo商品別表示に利用）
  for (var yahooListingIdForBom in yahooBomByListing) {
    var yRows = yahooBomByListing[yahooListingIdForBom];
    if (!yRows) continue;
    for (var yb = 0; yb < yRows.length; yb++) {
      var yr = yRows[yb];
      if (!yahooBomByInternal[yr.internal_id]) yahooBomByInternal[yr.internal_id] = [];
      yahooBomByInternal[yr.internal_id].push({ yahoo_listing_id: yr.yahoo_listing_id, qty: yr.qty });
    }
  }

  // 在庫（derived_stock）の考え方：
  // - metro在庫を採用（windyは監視用）
  // - ただし「同じ社内IDが複数SKUにまたがる」ケースで合算すると二重計上になり得るため、
  //   qty=1 のBOMが存在するSKUを「代表」とみなし、そのSKU在庫 = 社内ID在庫 とする。
  // - qty=1 の代表が無い社内IDは、従来どおり stock_qty * qty の合算にフォールバックする。
  var anchorStockByInternal = {}; // internal_id -> stock_qty (qty=1 のSKU在庫)
  var fallbackStockByInternal = {}; // internal_id -> Σ(stock_qty * qty)
  for (var listingStockId in metroData.stockByListing) {
    var stock_qty = metroData.stockByListing[listingStockId] || 0;
    var bomRows = bomByListing[listingStockId];
    if (!bomRows) continue; // 未マッピングSKUは別途対応（任意）
    for (var i = 0; i < bomRows.length; i++) {
      var b = bomRows[i];
      // フォールバック用（従来挙動）
      fallbackStockByInternal[b.internal_id] = (fallbackStockByInternal[b.internal_id] || 0) + stock_qty * b.qty;
      // 代表SKU（qty=1）がある場合は、その在庫を採用する
      // qty=1 が複数ある場合は、値が一致している前提だが、事故時に過小評価しないよう最大値を採用
      if (b.qty === 1) {
        if (anchorStockByInternal[b.internal_id] === undefined || stock_qty > anchorStockByInternal[b.internal_id]) {
          anchorStockByInternal[b.internal_id] = stock_qty;
        }
      }
    }
  }
  // derivedStock を確定（代表があれば代表、なければフォールバック）
  derivedStock = fallbackStockByInternal;
  for (var internalIdForAnchor in anchorStockByInternal) {
    derivedStock[internalIdForAnchor] = anchorStockByInternal[internalIdForAnchor];
  }

  for (var listingSalesId in metroData.salesByListing) {
    var bomRows2 = bomByListing[listingSalesId];
    if (!bomRows2) continue;
    var rHat = rHatByListing[listingSalesId] || 0;
    for (var j = 0; j < bomRows2.length; j++) {
      var b2 = bomRows2[j];
      avgCons[b2.internal_id] = (avgCons[b2.internal_id] || 0) + rHat * b2.qty;
    }
  }

  // 売上（先月/今月）をBOM展開して internal_id に集計
  for (var listingSalesId2 in metroData.salesByListing) {
    var sales2 = metroData.salesByListing[listingSalesId2] || { LM: 0, CM: 0 };
    var bomRows3 = bomByListing[listingSalesId2];
    if (!bomRows3) continue;
    for (var j2 = 0; j2 < bomRows3.length; j2++) {
      var b3 = bomRows3[j2];
      metroSalesLmByInternal[b3.internal_id] = (metroSalesLmByInternal[b3.internal_id] || 0) + (sales2.LM || 0) * b3.qty;
      metroSalesCmByInternal[b3.internal_id] = (metroSalesCmByInternal[b3.internal_id] || 0) + (sales2.CM || 0) * b3.qty;
    }
  }
  for (var listingSalesId3 in windyData.salesByListing) {
    var sales3 = windyData.salesByListing[listingSalesId3] || { LM: 0, CM: 0 };
    var bomRows4 = bomByListing[listingSalesId3];
    if (!bomRows4) continue;
    for (var j3 = 0; j3 < bomRows4.length; j3++) {
      var b4 = bomRows4[j3];
      windySalesLmByInternal[b4.internal_id] = (windySalesLmByInternal[b4.internal_id] || 0) + (sales3.LM || 0) * b4.qty;
      windySalesCmByInternal[b4.internal_id] = (windySalesCmByInternal[b4.internal_id] || 0) + (sales3.CM || 0) * b4.qty;
    }
  }

  // 7) internal指標生成
  var buffer = 14;
  var surplusCoverDays = 300;
  var itemMetrics = [];
  for (var internal_id in itemsMap) {
    var item = itemsMap[internal_id];
    if (!item.active) continue;

    var lead = Math.max(0, item.lead_time_days || 0);
    var safety = Math.max(0, item.safety_stock || 0);
    var lot = Math.max(1, item.lot_size || 1);
    var target = lead + buffer;

    var stock = derivedStock[internal_id] || 0;
    var cons = avgCons[internal_id] || 0;
    var days = cons === 0 ? null : stock / cons; // ∞はnullで表現

    var risk = 'green';
    // 休眠（在庫0かつ消費0）
    if (stock === 0 && cons === 0) {
      risk = 'dormant';
    }
    // 余剰（在庫日数が300日以上、または消費0で∞扱い）
    // NOTE: 在庫数が0のものは「余剰」にはしない
    else if (stock > 0 && (days === null || days >= surplusCoverDays)) {
      risk = 'surplus';
    } else if (days < lead) {
      risk = 'red';
    } else if (days < target) {
      risk = 'yellow';
    }

    var need = cons * target + safety - stock;
    var reorder = ceilToLot(Math.max(need, 0), lot);

    // 詳細画面用：SKU別（先月/今月）を item_metrics に埋め込む（metro/windy 両方）
    var listings = [];
    var bomRefs = bomByInternal[internal_id] || [];
    for (var bi = 0; bi < bomRefs.length; bi++) {
      var ref = bomRefs[bi];
      var lm = listingsMap[ref.listing_id];
      if (!lm || !lm.active) continue;

      var storeId = lm.store_id === 'windy' ? 'windy' : 'metro';
      var stockQty = (storeId === 'windy' ? windyData.stockByListing : metroData.stockByListing)[ref.listing_id] || 0;
      var sales = (storeId === 'windy' ? windyData.salesByListing : metroData.salesByListing)[ref.listing_id] || { LM: 0, CM: 0 };
      var rHat = rHatByListing[ref.listing_id] || 0;

      listings.push({
        listing_id: ref.listing_id,
        store_id: storeId,
        rakuten_item_no: lm.rakuten_item_no,
        rakuten_sku: lm.rakuten_sku,
        title: lm.title || '',
        stock_qty: stockQty,
        last_month_sales: sales.LM || 0,
        this_month_sales: sales.CM || 0,
        r_hat: rHat,
        bom_qty: ref.qty,
        contribution_stock: stockQty * ref.qty,
        contribution_consumption: rHat * ref.qty,
      });
    }

    itemMetrics.push({
      internal_id: internal_id,
      name: item.name,
      derived_stock: stock,
      avg_daily_consumption: cons,
      days_of_cover: days,
      metro_last_month_sales: metroSalesLmByInternal[internal_id] || 0,
      metro_this_month_sales: metroSalesCmByInternal[internal_id] || 0,
      windy_last_month_sales: windySalesLmByInternal[internal_id] || 0,
      windy_this_month_sales: windySalesCmByInternal[internal_id] || 0,
      yahoo_last_month_sales: yahooSalesLmByInternal[internal_id] || 0,
      yahoo_this_month_sales: yahooSalesCmByInternal[internal_id] || 0,
      lead_time_days: lead,
      safety_stock: safety,
      lot_size: lot,
      target_cover_days: target,
      need_qty: need,
      reorder_qty_suggested: reorder,
      risk_level: risk,
      default_unit_cost: item.default_unit_cost,
      listings: listings,
      // 詳細画面用：Yahoo商品別（先月/今月）
      yahoo_listings: (function () {
        var out = [];
        var yrefs = yahooBomByInternal[internal_id] || [];
        for (var yi = 0; yi < yrefs.length; yi++) {
          var ref = yrefs[yi];
          var yid = toStringSafe(ref.yahoo_listing_id);
          if (!yid) continue;
          var lmQty = yahooLmByListing[yid] || 0;
          var cmQty = yahooCmByListing[yid] || 0;

          // 表示名などは yahoo_listings → item_reportメタ → yahoo_listing_id分解 の順に補完
          var meta = yahooListingsMap[yid] || yahooLmMetaByListing[yid] || yahooCmMetaByListing[yid] || {};
          var itemCode = meta.item_code ? String(meta.item_code) : '';
          var subCode = meta.sub_code ? String(meta.sub_code) : '';
          var name2 = meta.name ? String(meta.name) : '';
          if (!itemCode || !subCode) {
            var p = String(yid).split('|');
            itemCode = itemCode || (p.length >= 1 ? p[0] : '');
            subCode = subCode || (p.length >= 2 ? p.slice(1).join('|') : '');
          }

          out.push({
            yahoo_listing_id: yid,
            item_code: itemCode,
            sub_code: subCode,
            name: name2,
            last_month_sales: lmQty,
            this_month_sales: cmQty,
            bom_qty: ref.qty || 0,
          });
        }
        // 売上があるものを優先して見やすく
        out.sort(function (a, b) {
          var as = (a.this_month_sales || 0) + (a.last_month_sales || 0);
          var bs = (b.this_month_sales || 0) + (b.last_month_sales || 0);
          if (as !== bs) return bs - as;
          return String(a.yahoo_listing_id).localeCompare(String(b.yahoo_listing_id));
        });
        return out.length ? out : undefined;
      })(),
    });
  }

  // 8) ミラーずれ検知（internal_id）
  // NOTE:
  // - SKU番号が店舗ごとに異なるケースがあるため、商品管理番号|SKU番号（rakuten_key）での1:1突合は使わない。
  // - 代わりに、各店舗の listing 在庫を BOM で internal_id に展開し、internal_id 単位で metro vs windy を比較する。
  // - BOM未登録のlistingはここでは比較不能（unmappedListings に出す）。
  function addInternalStock_(stockByListing, outInternal) {
    for (var listing_id in stockByListing) {
      var stockQty = stockByListing[listing_id] || 0;
      // 0在庫は寄与0のためスキップしても結果は変わらない（処理量削減）
      if (stockQty === 0) continue;
      var refs = bomByListing[listing_id];
      if (!refs || refs.length === 0) continue;
      for (var i = 0; i < refs.length; i++) {
        var ref = refs[i];
        var internal_id = ref.internal_id;
        var qty = ref.qty || 0;
        if (!internal_id || qty === 0) continue;
        var contrib = stockQty * qty;
        outInternal[internal_id] = (outInternal[internal_id] || 0) + contrib;
      }
    }
  }

  var metroByInternal = {};
  var windyByInternal = {};
  addInternalStock_(metroData.stockByListing || {}, metroByInternal);
  addInternalStock_(windyData.stockByListing || {}, windyByInternal);

  var internalKeys = {};
  for (var kInt1 in metroByInternal) internalKeys[kInt1] = true;
  for (var kInt2 in windyByInternal) internalKeys[kInt2] = true;

  var mirrorMismatches = [];
  for (var internal_id in internalKeys) {
    var metroQty = metroByInternal[internal_id] !== undefined ? metroByInternal[internal_id] : 0;
    var windyQty = windyByInternal[internal_id] !== undefined ? windyByInternal[internal_id] : 0;
    if (metroQty === windyQty) continue;
    var item = itemsMap[internal_id];
    mirrorMismatches.push({
      internal_id: internal_id,
      name: item ? item.name : '',
      metro_stock_qty: metroQty,
      windy_stock_qty: windyQty,
      diff: metroQty - windyQty,
    });
  }

  // 差分が大きい順で見やすくする
  mirrorMismatches.sort(function (a, b) {
    return Math.abs(b.diff) - Math.abs(a.diff);
  });

  // 9) 未マッピングSKU（BOM未登録）を抽出（推奨）
  var unmappedListings = [];
  function collectUnmapped_(storeId, stockByListing, salesByListing) {
    for (var lid in stockByListing) {
      if (bomByListing[lid]) continue;
      // 「取り扱い不可」にされたSKUは監視から除外（A方針）
      if (listingHandling[lid] && listingHandling[lid].handling_status === 'unavailable') continue;
      // listing_id は store|itemNo|sku の前提
      var p = String(lid).split('|');
      var itemNo = p.length >= 2 ? p[1] : '';
      var sku = p.length >= 3 ? p.slice(2).join('|') : '';
      var sales = salesByListing[lid] || { LM: 0, CM: 0 };
      unmappedListings.push({
        store_id: storeId,
        listing_id: lid,
        rakuten_item_no: itemNo,
        rakuten_sku: sku,
        stock_qty: stockByListing[lid] || 0,
        last_month_sales: sales.LM || 0,
        this_month_sales: sales.CM || 0,
      });
    }
  }
  collectUnmapped_('metro', metroData.stockByListing, metroData.salesByListing);
  collectUnmapped_('windy', windyData.stockByListing, windyData.salesByListing);

  // 10) listingスナップショット（全SKU、表示用の最新値）
  // NOTE: 未紐付け/除外中とも「同じ算出元の最新値」を見せるためのview
  var listingSnapshots = [];
  function collectSnapshots_(storeId, stockByListing, salesByListing) {
    // salesByListing が正とみなせるが、念のためstock側もunion
    var keys = {};
    for (var lid1 in salesByListing) keys[lid1] = true;
    for (var lid2 in stockByListing) keys[lid2] = true;
    for (var lid in keys) {
      // listing_id は store|itemNo|sku の前提
      var p = String(lid).split('|');
      var itemNo = p.length >= 2 ? p[1] : '';
      var sku = p.length >= 3 ? p.slice(2).join('|') : '';
      var sales = salesByListing[lid] || { LM: 0, CM: 0 };
      listingSnapshots.push({
        store_id: storeId,
        listing_id: lid,
        rakuten_item_no: itemNo,
        rakuten_sku: sku,
        stock_qty: stockByListing[lid] || 0,
        last_month_sales: sales.LM || 0,
        this_month_sales: sales.CM || 0,
      });
    }
  }
  collectSnapshots_('metro', metroData.stockByListing, metroData.salesByListing);
  collectSnapshots_('windy', windyData.stockByListing, windyData.salesByListing);

  // 11) Yahoo 未マッピング（yahoo_bom未登録）を抽出
  // - Yahooは在庫を扱わないため、売上（注文点数合計）があるものを優先して出す
  var yahooUnmappedListings = [];
  var yahooKeys = {};
  for (var y1 in yahooLmByListing) yahooKeys[y1] = true;
  for (var y2 in yahooCmByListing) yahooKeys[y2] = true;
  for (var yid in yahooKeys) {
    if (yahooBomByListing && yahooBomByListing[yid]) continue; // BOMあり
    var lmQty = yahooLmByListing[yid] || 0;
    var cmQty = yahooCmByListing[yid] || 0;
    // 0のみはノイズが多いので出さない（必要なら後で切替可能）
    if (lmQty + cmQty === 0) continue;

    // メタは先月→今月の順で補完
    var meta = (yahooLmMetaByListing && yahooLmMetaByListing[yid]) || (yahooCmMetaByListing && yahooCmMetaByListing[yid]) || {};
    yahooUnmappedListings.push({
      yahoo_listing_id: yid,
      item_code: meta.item_code || '',
      sub_code: meta.sub_code || '',
      name: meta.name || '',
      last_month_sales: lmQty,
      this_month_sales: cmQty,
    });
  }
  yahooUnmappedListings.sort(function (a, b) {
    var aSales = (a.last_month_sales || 0) + (a.this_month_sales || 0);
    var bSales = (b.last_month_sales || 0) + (b.this_month_sales || 0);
    if (aSales !== bSales) return bSales - aSales;
    return String(a.yahoo_listing_id).localeCompare(String(b.yahoo_listing_id));
  });

  Logger.log(
    JSON.stringify({
      ok: true,
      d: d,
      Dprev: Dprev,
      itemMetrics: itemMetrics.length,
      mirrorMismatches: mirrorMismatches.length,
      unmappedListings: unmappedListings.length,
      listingSnapshots: listingSnapshots.length,
      yahooUnmappedListings: yahooUnmappedListings.length,
      ms: Date.now() - started,
    })
  );

  return {
    itemMetrics: itemMetrics,
    mirrorMismatches: mirrorMismatches,
    unmappedListings: unmappedListings,
    listingSnapshots: listingSnapshots,
    yahooUnmappedListings: yahooUnmappedListings,
  };
}

