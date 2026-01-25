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

  // 3) 店舗別データ
  var metroData = readRakutenSheet_(sources.metro);
  var windyData = readRakutenSheet_(sources.windy);

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

  for (var listingStockId in metroData.stockByListing) {
    var stock_qty = metroData.stockByListing[listingStockId] || 0;
    var bomRows = bomByListing[listingStockId];
    if (!bomRows) continue; // 未マッピングSKUは別途対応（任意）
    for (var i = 0; i < bomRows.length; i++) {
      var b = bomRows[i];
      derivedStock[b.internal_id] = (derivedStock[b.internal_id] || 0) + stock_qty * b.qty;
    }
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
    if (days !== null) {
      if (days < lead) risk = 'red';
      else if (days < target) risk = 'yellow';
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
      lead_time_days: lead,
      safety_stock: safety,
      lot_size: lot,
      target_cover_days: target,
      need_qty: need,
      reorder_qty_suggested: reorder,
      risk_level: risk,
      default_unit_cost: item.default_unit_cost,
      listings: listings,
    });
  }

  // 8) ミラーずれ検知（rakuten_key）
  // NOTE: listingsマスタに依存すると検知漏れが出るため、参照シートから直接rakuten_keyを作って突合する
  var metroByKey = metroData.stockByRakutenKey || {};
  var windyByKey = windyData.stockByRakutenKey || {};

  var keys = {};
  for (var k3 in metroByKey) keys[k3] = true;
  for (var k4 in windyByKey) keys[k4] = true;

  var mirrorMismatches = [];
  for (var key in keys) {
    var metroQty = metroByKey[key] !== undefined ? metroByKey[key] : 0;
    var windyQty = windyByKey[key] !== undefined ? windyByKey[key] : 0;
    if (metroQty === windyQty) continue;
    var parts = key.split('|');
    mirrorMismatches.push({
      rakuten_item_no: parts[0],
      rakuten_sku: parts[1],
      metro_stock_qty: metroQty,
      windy_stock_qty: windyQty,
      diff: metroQty - windyQty,
    });
  }

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

  Logger.log(
    JSON.stringify({
      ok: true,
      d: d,
      Dprev: Dprev,
      itemMetrics: itemMetrics.length,
      mirrorMismatches: mirrorMismatches.length,
      unmappedListings: unmappedListings.length,
      listingSnapshots: listingSnapshots.length,
      ms: Date.now() - started,
    })
  );

  return { itemMetrics: itemMetrics, mirrorMismatches: mirrorMismatches, unmappedListings: unmappedListings, listingSnapshots: listingSnapshots };
}

