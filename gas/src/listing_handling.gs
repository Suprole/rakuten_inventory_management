function upsertListingHandling_(payload) {
  if (!payload) throw new Error('payload is required');
  var listing_id = toStringSafe(payload.listing_id);
  if (!listing_id) throw new Error('listing_id is required');

  var handling_status = toStringSafe(payload.handling_status) || 'normal';
  if (handling_status !== 'normal' && handling_status !== 'unavailable') {
    throw new Error('invalid handling_status: ' + handling_status);
  }

  var updated_at = nowIsoJst_();
  var updated_by = toStringSafe(payload.updated_by || payload.actor || '');

  // オプション（監視画面から渡すと便利）
  var store_id = toStringSafe(payload.store_id);
  var rakuten_item_no = toStringSafe(payload.rakuten_item_no);
  var rakuten_sku = toStringSafe(payload.rakuten_sku);
  var note = toStringSafe(payload.note);

  // 既存取得（beforeを監査ログに残す）
  var beforeStatus = '';
  var beforeNote = '';
  try {
    var t0 = readTable_('listing_handling');
    if (t0 && t0.rows && t0.rows.length && t0.header && t0.header['listing_id'] !== undefined) {
      var lidIdx = t0.header['listing_id'];
      for (var r = 0; r < t0.rows.length; r++) {
        var row = t0.rows[r];
        if (toStringSafe(row[lidIdx]) !== listing_id) continue;
        beforeStatus = t0.header['handling_status'] !== undefined ? toStringSafe(row[t0.header['handling_status']]) : '';
        beforeNote = t0.header['note'] !== undefined ? toStringSafe(row[t0.header['note']]) : '';
        break;
      }
    }
  } catch (e) {
    // readTable_ が失敗する（シート不存在など）場合はそのまま上位で落とす
    throw e;
  }

  // upsert
  var ok = updateRowWhere_('listing_handling', 'listing_id', listing_id, {
    store_id: store_id,
    rakuten_item_no: rakuten_item_no,
    rakuten_sku: rakuten_sku,
    handling_status: handling_status,
    note: note,
    updated_at: updated_at,
    updated_by: updated_by,
  });

  if (!ok) {
    appendRow_(
      'listing_handling',
      ['listing_id', 'store_id', 'rakuten_item_no', 'rakuten_sku', 'handling_status', 'note', 'updated_at', 'updated_by'],
      {
        listing_id: listing_id,
        store_id: store_id,
        rakuten_item_no: rakuten_item_no,
        rakuten_sku: rakuten_sku,
        handling_status: handling_status,
        note: note,
        updated_at: updated_at,
        updated_by: updated_by,
      }
    );
  }

  // audit log（存在しない場合は黙ってスキップ）
  try {
    appendRow_(
      'audit_log',
      ['ts', 'actor', 'action', 'entity_type', 'entity_id', 'before', 'after', 'note'],
      {
        ts: updated_at,
        actor: updated_by,
        action: 'upsert_listing_handling',
        entity_type: 'listing',
        entity_id: listing_id,
        before: JSON.stringify({ handling_status: beforeStatus, note: beforeNote }),
        after: JSON.stringify({ handling_status: handling_status, note: note }),
        note: note,
      }
    );
  } catch (e2) {
    // 監査ログ失敗は致命にしない（運用で後から直せる）
    Logger.log('[warn] audit_log append failed: ' + (e2 && e2.message ? e2.message : String(e2)));
  }

  return { ok: true, listing_id: listing_id, handling_status: handling_status, updated_at: updated_at, updated_by: updated_by };
}

function listListingHandling_(params) {
  params = params || {};
  var statusFilter = toStringSafe(params.handling_status || params.status || '');
  if (statusFilter && statusFilter !== 'normal' && statusFilter !== 'unavailable') {
    throw new Error('invalid handling_status filter: ' + statusFilter);
  }

  var t = readTable_('listing_handling');
  if (!t || !t.rows) return { ok: true, items: [] };
  requireCols(t.header, ['listing_id', 'handling_status'], 'listing_handling');

  var out = [];
  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var lid = toStringSafe(r[t.header['listing_id']]);
    if (!lid) continue;
    var st = toStringSafe(r[t.header['handling_status']]) || 'normal';
    if (st !== 'normal' && st !== 'unavailable') st = 'normal';
    if (statusFilter && st !== statusFilter) continue;

    out.push({
      listing_id: lid,
      store_id: t.header['store_id'] !== undefined ? toStringSafe(r[t.header['store_id']]) : '',
      rakuten_item_no: t.header['rakuten_item_no'] !== undefined ? toStringSafe(r[t.header['rakuten_item_no']]) : '',
      rakuten_sku: t.header['rakuten_sku'] !== undefined ? toStringSafe(r[t.header['rakuten_sku']]) : '',
      handling_status: st,
      note: t.header['note'] !== undefined ? toStringSafe(r[t.header['note']]) : '',
      updated_at: t.header['updated_at'] !== undefined ? toStringSafe(r[t.header['updated_at']]) : '',
      updated_by: t.header['updated_by'] !== undefined ? toStringSafe(r[t.header['updated_by']]) : '',
    });
  }

  // updated_at desc（空は最後）
  out.sort(function (a, b) {
    var aa = a.updated_at || '';
    var bb = b.updated_at || '';
    if (!aa && bb) return 1;
    if (aa && !bb) return -1;
    if (aa < bb) return 1;
    if (aa > bb) return -1;
    return String(a.listing_id).localeCompare(String(b.listing_id));
  });

  return { ok: true, items: out };
}

