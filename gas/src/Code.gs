/**
 * GAS WebApp entrypoint
 */
function doGet(e) {
  return handleApi('GET', e);
}

function doPost(e) {
  return handleApi('POST', e);
}

/**
 * 手動実行用（トリガーからも呼ぶ）
 * - Sheets → 計算 → GCS upload
 */
function runDailyEtl() {
  var out = runEtlOnce();
  var itemMetricsJson = JSON.stringify(out.itemMetrics);
  var mirrorJson = JSON.stringify(out.mirrorMismatches);
  var unmappedJson = JSON.stringify(out.unmappedListings || []);

  uploadViewJson('view/item_metrics.json', itemMetricsJson);
  uploadViewJson('view/mirror_mismatch.json', mirrorJson);
  uploadViewJson('view/unmapped_listings.json', unmappedJson);

  Logger.log(
    '[runDailyEtl] uploaded view/item_metrics.json (' +
      out.itemMetrics.length +
      ') and view/mirror_mismatch.json (' +
      out.mirrorMismatches.length +
      ') and view/unmapped_listings.json (' +
      (out.unmappedListings ? out.unmappedListings.length : 0) +
      ')'
  );
}

