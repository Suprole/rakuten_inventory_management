function upsertItemHandling_(payload) {
  if (!payload) throw new Error('payload is required');
  var internal_id = toStringSafe(payload.internal_id);
  if (!internal_id) throw new Error('internal_id is required');

  var handling_status = toStringSafe(payload.handling_status) || 'normal';
  if (handling_status !== 'normal' && handling_status !== 'deferred') {
    throw new Error('invalid handling_status: ' + handling_status);
  }

  var suppress_until = toStringSafe(payload.suppress_until);
  if (suppress_until && !/^\d{4}-\d{2}-\d{2}$/.test(suppress_until)) {
    throw new Error('invalid suppress_until: ' + suppress_until);
  }

  var note = toStringSafe(payload.note);
  var updated_at = nowIsoJst_();
  var updated_by = toStringSafe(payload.updated_by || payload.actor || '');

  var beforeStatus = '';
  var beforeUntil = '';
  var beforeNote = '';
  try {
    var t0 = readTable_('item_handling');
    if (t0 && t0.rows && t0.rows.length && t0.header && t0.header['internal_id'] !== undefined) {
      var idIdx = t0.header['internal_id'];
      for (var r = 0; r < t0.rows.length; r++) {
        var row = t0.rows[r];
        if (toStringSafe(row[idIdx]) !== internal_id) continue;
        beforeStatus = t0.header['handling_status'] !== undefined ? toStringSafe(row[t0.header['handling_status']]) : '';
        beforeUntil = t0.header['suppress_until'] !== undefined ? toStringSafe(row[t0.header['suppress_until']]) : '';
        beforeNote = t0.header['note'] !== undefined ? toStringSafe(row[t0.header['note']]) : '';
        break;
      }
    }
  } catch (e) {
    throw e;
  }

  var ok = updateRowWhere_('item_handling', 'internal_id', internal_id, {
    handling_status: handling_status,
    suppress_until: suppress_until,
    note: note,
    updated_at: updated_at,
    updated_by: updated_by,
  });

  if (!ok) {
    appendRow_(
      'item_handling',
      ['internal_id', 'handling_status', 'suppress_until', 'note', 'updated_at', 'updated_by'],
      {
        internal_id: internal_id,
        handling_status: handling_status,
        suppress_until: suppress_until,
        note: note,
        updated_at: updated_at,
        updated_by: updated_by,
      }
    );
  }

  try {
    appendRow_(
      'audit_log',
      ['ts', 'actor', 'action', 'entity_type', 'entity_id', 'before', 'after', 'note'],
      {
        ts: updated_at,
        actor: updated_by,
        action: 'upsert_item_handling',
        entity_type: 'item',
        entity_id: internal_id,
        before: JSON.stringify({ handling_status: beforeStatus, suppress_until: beforeUntil, note: beforeNote }),
        after: JSON.stringify({ handling_status: handling_status, suppress_until: suppress_until, note: note }),
        note: note,
      }
    );
  } catch (e2) {
    Logger.log('[warn] audit_log append failed: ' + (e2 && e2.message ? e2.message : String(e2)));
  }

  return {
    ok: true,
    internal_id: internal_id,
    handling_status: handling_status,
    suppress_until: suppress_until,
    note: note,
    updated_at: updated_at,
    updated_by: updated_by,
  };
}

function listItemHandling_(params) {
  params = params || {};
  var statusFilter = toStringSafe(params.handling_status || params.status || '');
  if (statusFilter && statusFilter !== 'normal' && statusFilter !== 'deferred') {
    throw new Error('invalid handling_status filter: ' + statusFilter);
  }
  var internalIdFilter = toStringSafe(params.internal_id || '');

  var t;
  try {
    t = readTable_('item_handling');
  } catch (e) {
    return { ok: true, items: [] };
  }
  if (!t || !t.rows) return { ok: true, items: [] };
  requireCols(t.header, ['internal_id', 'handling_status'], 'item_handling');

  var byId = {};
  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var internal_id = toStringSafe(r[t.header['internal_id']]);
    if (!internal_id) continue;
    if (internalIdFilter && internal_id !== internalIdFilter) continue;

    var st = toStringSafe(r[t.header['handling_status']]) || 'normal';
    if (st !== 'normal' && st !== 'deferred') st = 'normal';
    if (statusFilter && st !== statusFilter) continue;

    byId[internal_id] = {
      internal_id: internal_id,
      handling_status: st,
      suppress_until: t.header['suppress_until'] !== undefined ? toStringSafe(r[t.header['suppress_until']]) : '',
      note: t.header['note'] !== undefined ? toStringSafe(r[t.header['note']]) : '',
      updated_at: t.header['updated_at'] !== undefined ? toStringSafe(r[t.header['updated_at']]) : '',
      updated_by: t.header['updated_by'] !== undefined ? toStringSafe(r[t.header['updated_by']]) : '',
    };
  }

  var out = [];
  for (var key in byId) out.push(byId[key]);

  out.sort(function (a, b) {
    var aa = a.updated_at || '';
    var bb = b.updated_at || '';
    if (!aa && bb) return 1;
    if (aa && !bb) return -1;
    if (aa < bb) return 1;
    if (aa > bb) return -1;
    return String(a.internal_id).localeCompare(String(b.internal_id));
  });

  return { ok: true, items: out };
}
