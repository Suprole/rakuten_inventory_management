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
  var listingSnapshotJson = JSON.stringify(out.listingSnapshots || []);

  uploadViewJson('view/item_metrics.json', itemMetricsJson);
  uploadViewJson('view/mirror_mismatch.json', mirrorJson);
  uploadViewJson('view/unmapped_listings.json', unmappedJson);
  uploadViewJson('view/listing_snapshot.json', listingSnapshotJson);

  Logger.log(
    '[runDailyEtl] uploaded view/item_metrics.json (' +
      out.itemMetrics.length +
      ') and view/mirror_mismatch.json (' +
      out.mirrorMismatches.length +
      ') and view/unmapped_listings.json (' +
      (out.unmappedListings ? out.unmappedListings.length : 0) +
      ') and view/listing_snapshot.json (' +
      (out.listingSnapshots ? out.listingSnapshots.length : 0) +
      ')'
  );
}

/**
 * Mail送信権限の承認を発火させるための手動実行用関数。
 * Apps Scriptエディタから1回実行して承認してください（テストメールが1通送られます）。
 */
function authorizeMail() {
  var to = '';
  try {
    to = Session.getEffectiveUser().getEmail();
  } catch (e) {
    to = '';
  }
  if (!to) throw new Error('送信先メール（Session.getEffectiveUser().getEmail()）が取得できません。手動で to を指定してください。');
  MailApp.sendEmail({
    to: to,
    subject: '[rakuten-inventory] mail scope authorize test',
    body: 'これはメール送信権限（script.send_mail）の承認テストです。不要なら削除してください。',
  });
  return { ok: true, to: to };
}
