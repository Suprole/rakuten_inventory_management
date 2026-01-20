function nowIsoJst_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function getSheetOrThrow_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('sheet not found: ' + name);
  return sheet;
}

function readTable_(sheetName) {
  var sheet = getSheetOrThrow_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { header: {}, rows: [] };
  var header = indexHeader(values[0]);
  return { header: header, rows: values.slice(1), sheet: sheet };
}

function appendRow_(sheetName, headerKeys, rowObj) {
  var t = readTable_(sheetName);
  var sheet = t.sheet;
  requireCols(t.header, headerKeys, sheetName);
  var row = [];
  for (var i = 0; i < headerKeys.length; i++) {
    var key = headerKeys[i];
    row[t.header[key]] = rowObj[key];
  }
  // シートの列数に合わせて埋める（最低ヘッダ幅）
  var width = Object.keys(t.header).length;
  var out = new Array(width);
  for (var j = 0; j < width; j++) out[j] = '';
  for (var k in t.header) {
    var idx = t.header[k];
    out[idx] = row[idx] !== undefined ? row[idx] : '';
  }
  sheet.appendRow(out);
}

function updateRowWhere_(sheetName, keyColName, keyValue, updates) {
  var t = readTable_(sheetName);
  var sheet = t.sheet;
  requireCols(t.header, [keyColName], sheetName);
  var keyIdx = t.header[keyColName];
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  if (values.length < 2) return false;
  for (var r = 1; r < values.length; r++) {
    if (toStringSafe(values[r][keyIdx]) !== toStringSafe(keyValue)) continue;
    // update columns
    for (var col in updates) {
      if (t.header[col] === undefined) continue;
      values[r][t.header[col]] = updates[col];
    }
    dataRange.setValues(values);
    return true;
  }
  return false;
}

function generatePoId_() {
  // PO-YYYYMMDD-001
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  var prefix = 'PO-' + today + '-';
  var t = readTable_('po_header');
  if (!t.rows) t.rows = [];
  var maxSeq = 0;
  for (var i = 0; i < t.rows.length; i++) {
    var row = t.rows[i];
    var poId = toStringSafe(row[t.header['po_id']]);
    if (poId.indexOf(prefix) !== 0) continue;
    var seqStr = poId.substring(prefix.length);
    var seq = parseInt(seqStr, 10);
    if (!isNaN(seq)) maxSeq = Math.max(maxSeq, seq);
  }
  var nextSeq = maxSeq + 1;
  var seq3 = ('000' + nextSeq).slice(-3);
  return prefix + seq3;
}

function poCreate_(payload) {
  if (!payload || !payload.lines || !payload.lines.length) throw new Error('lines is required');

  var lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    var po_id = generatePoId_();
    var created_at = nowIsoJst_();
    var status = 'draft';

    appendRow_('po_header', ['po_id', 'created_at', 'status', 'supplier', 'note'], {
      po_id: po_id,
      created_at: created_at,
      status: status,
      supplier: payload.supplier || '',
      note: payload.note || '',
    });

    // lines
    for (var i = 0; i < payload.lines.length; i++) {
      var line = payload.lines[i];
      if (!line || !line.internal_id) throw new Error('line.internal_id is required');
      var line_no = i + 1;
      appendRow_('po_lines', ['po_id', 'line_no', 'internal_id', 'qty', 'unit_cost', 'basis_need_qty', 'basis_days_of_cover'], {
        po_id: po_id,
        line_no: line_no,
        internal_id: line.internal_id,
        qty: Number(line.qty || 0),
        unit_cost: line.unit_cost !== undefined ? Number(line.unit_cost) : '',
        basis_need_qty: line.basis_need_qty !== undefined ? Number(line.basis_need_qty) : '',
        basis_days_of_cover: line.basis_days_of_cover !== undefined ? Number(line.basis_days_of_cover) : '',
      });
    }

    return { ok: true, po_id: po_id };
  } finally {
    lock.releaseLock();
  }
}

function poList_() {
  var t = readTable_('po_header');
  requireCols(t.header, ['po_id', 'created_at', 'status', 'supplier', 'note'], 'po_header');

  // po_lines から item_count / total_qty を集計
  var linesT = readTable_('po_lines');
  var agg = {}; // po_id -> { item_count, total_qty }
  if (linesT && linesT.rows && linesT.rows.length) {
    // 必須列が無い場合は集計しない（画面側で0扱い）
    if (
      linesT.header['po_id'] !== undefined &&
      linesT.header['qty'] !== undefined
    ) {
      for (var li = 0; li < linesT.rows.length; li++) {
        var lr = linesT.rows[li];
        var poId = toStringSafe(lr[linesT.header['po_id']]);
        if (!poId) continue;
        if (!agg[poId]) agg[poId] = { item_count: 0, total_qty: 0 };
        agg[poId].item_count += 1;
        agg[poId].total_qty += Number(lr[linesT.header['qty']] || 0);
      }
    }
  }

  var out = [];
  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var poId2 = toStringSafe(r[t.header['po_id']]);
    var a = agg[poId2] || { item_count: 0, total_qty: 0 };
    out.push({
      po_id: poId2,
      created_at: toStringSafe(r[t.header['created_at']]),
      status: toStringSafe(r[t.header['status']]),
      supplier: toStringSafe(r[t.header['supplier']]),
      note: toStringSafe(r[t.header['note']]),
      item_count: a.item_count,
      total_qty: a.total_qty,
    });
  }
  return { ok: true, items: out };
}

function poDetail_(poId) {
  var headerT = readTable_('po_header');
  requireCols(headerT.header, ['po_id', 'created_at', 'status', 'supplier', 'note'], 'po_header');
  var header = null;
  for (var i = 0; i < headerT.rows.length; i++) {
    var r = headerT.rows[i];
    if (toStringSafe(r[headerT.header['po_id']]) === toStringSafe(poId)) {
      header = {
        po_id: toStringSafe(r[headerT.header['po_id']]),
        created_at: toStringSafe(r[headerT.header['created_at']]),
        status: toStringSafe(r[headerT.header['status']]),
        supplier: toStringSafe(r[headerT.header['supplier']]),
        note: toStringSafe(r[headerT.header['note']]),
      };
      break;
    }
  }
  if (!header) return { ok: false, error: 'not_found' };

  var linesT = readTable_('po_lines');
  requireCols(linesT.header, ['po_id', 'line_no', 'internal_id', 'qty', 'unit_cost', 'basis_need_qty', 'basis_days_of_cover'], 'po_lines');
  var lines = [];
  for (var j = 0; j < linesT.rows.length; j++) {
    var lr = linesT.rows[j];
    if (toStringSafe(lr[linesT.header['po_id']]) !== toStringSafe(poId)) continue;
    lines.push({
      po_id: toStringSafe(lr[linesT.header['po_id']]),
      line_no: Number(lr[linesT.header['line_no']] || 0),
      internal_id: toStringSafe(lr[linesT.header['internal_id']]),
      qty: Number(lr[linesT.header['qty']] || 0),
      unit_cost: lr[linesT.header['unit_cost']] === '' ? undefined : Number(lr[linesT.header['unit_cost']]),
      basis_need_qty: lr[linesT.header['basis_need_qty']] === '' ? undefined : Number(lr[linesT.header['basis_need_qty']]),
      basis_days_of_cover:
        lr[linesT.header['basis_days_of_cover']] === '' ? undefined : Number(lr[linesT.header['basis_days_of_cover']]),
    });
  }

  // line_no順
  lines.sort(function (a, b) {
    return a.line_no - b.line_no;
  });

  return { ok: true, header: header, lines: lines };
}

function poUpdateStatus_(poId, status) {
  if (status !== 'draft' && status !== 'sent' && status !== 'cancelled') throw new Error('invalid status');
  var ok = updateRowWhere_('po_header', 'po_id', poId, { status: status });
  if (!ok) return { ok: false, error: 'not_found' };
  return { ok: true };
}

