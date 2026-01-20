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

function deleteRowsWhere_(sheetName, keyColName, keyValue) {
  var t = readTable_(sheetName);
  var sheet = t.sheet;
  requireCols(t.header, [keyColName], sheetName);
  var keyIdx = t.header[keyColName];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;

  // deleteRow は行番号が詰まるため、下から消す
  var toDelete = [];
  for (var r = 1; r < values.length; r++) {
    if (toStringSafe(values[r][keyIdx]) !== toStringSafe(keyValue)) continue;
    toDelete.push(r + 1); // 1-based sheet row
  }
  for (var i = toDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(toDelete[i]);
  }
  return toDelete.length;
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
  var lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    // 現在ステータスを取得（sent→sent などの再送を防ぐ）
    var headerT = readTable_('po_header');
    requireCols(headerT.header, ['po_id', 'status', 'supplier', 'note', 'created_at'], 'po_header');
    var currentStatus = null;
    var headerRow = null;
    for (var i = 0; i < headerT.rows.length; i++) {
      var r = headerT.rows[i];
      if (toStringSafe(r[headerT.header['po_id']]) === toStringSafe(poId)) {
        currentStatus = toStringSafe(r[headerT.header['status']]);
        headerRow = r;
        break;
      }
    }
    if (currentStatus === null) return { ok: false, error: 'not_found' };

    var ok = updateRowWhere_('po_header', 'po_id', poId, { status: status });
    if (!ok) return { ok: false, error: 'not_found' };

    // draft/cancelled → sent のときだけメール送信
    if (status === 'sent' && currentStatus !== 'sent') {
      try {
        sendPoEmailOnSent_(poId);
      } catch (mailErr) {
        // 発注ステータス更新は成功させるが、メール送信失敗はログに残す
        var msg = mailErr && mailErr.message ? mailErr.message : String(mailErr);
        Logger.log('[poUpdateStatus_] mail failed: ' + msg);
        return { ok: true, mail_sent: false, mail_error: msg };
      }
      return { ok: true, mail_sent: true };
    }

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getPoEmailRecipients_() {
  var raw = PropertiesService.getScriptProperties().getProperty('PO_EMAIL_RECIPIENTS') || '';
  var parts = raw.split(/[,;\s]+/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var s = String(parts[i] || '').trim();
    if (!s) continue;
    out.push(s);
  }
  return out;
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function yen_(n) {
  var x = Number(n || 0);
  if (isNaN(x)) x = 0;
  return '¥' + Math.round(x).toLocaleString();
}

function csvEscape_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  // 改行/カンマ/ダブルクオートを含む場合はダブルクオートで囲み、内部の"は""にする
  if (/[,"\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildPoCsv_(poId, sentDate, supplierVal, noteVal, lines) {
  var rows = [];
  // 先頭にBOM（Excel向け）
  var BOM = '\uFEFF';
  rows.push(['発注ID', poId]);
  rows.push(['発注日', sentDate]);
  if (supplierVal) rows.push(['サプライヤー', supplierVal]);
  if (noteVal) rows.push(['備考', noteVal]);
  rows.push([]); // 空行
  rows.push(['発注ID', '商品コード', '数量(個)', '単価', '合計額']);
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    var qty = Number(ln.qty || 0);
    var unitCost = ln.unit_cost !== undefined ? Number(ln.unit_cost) : 0;
    var amt = qty * unitCost;
    rows.push([poId, ln.internal_id, qty, yen_(unitCost), yen_(amt)]);
  }
  var totalQty = 0;
  var totalAmount = 0;
  for (var j = 0; j < lines.length; j++) {
    var ln2 = lines[j];
    var qty2 = Number(ln2.qty || 0);
    var unitCost2 = ln2.unit_cost !== undefined ? Number(ln2.unit_cost) : 0;
    totalQty += qty2;
    totalAmount += qty2 * unitCost2;
  }
  rows.push([]);
  rows.push(['発注件数', lines.length + '件']);
  rows.push(['合計数量', totalQty + '個']);
  rows.push(['合計発注額', yen_(totalAmount)]);

  var csv = rows
    .map(function (r) {
      return r.map(csvEscape_).join(',');
    })
    .join('\r\n');
  return BOM + csv;
}

function buildPoPdfBlob_(poId, sentDate, supplierVal, noteVal, lines, totalQty, totalAmount) {
  var rowsHtml = '';
  for (var k = 0; k < lines.length; k++) {
    var ln = lines[k];
    var qty = Number(ln.qty || 0);
    var unitCost = ln.unit_cost !== undefined ? Number(ln.unit_cost) : 0;
    var amt = qty * unitCost;
    rowsHtml +=
      '<tr>' +
        '<td style="border:1px solid #444;padding:6px;white-space:nowrap;">' + escapeHtml_(poId) + '</td>' +
        '<td style="border:1px solid #444;padding:6px;white-space:nowrap;">' + escapeHtml_(ln.internal_id) + '</td>' +
        '<td style="border:1px solid #444;padding:6px;text-align:right;white-space:nowrap;">' + escapeHtml_(String(qty)) + '</td>' +
        '<td style="border:1px solid #444;padding:6px;text-align:right;white-space:nowrap;">' + escapeHtml_(yen_(unitCost)) + '</td>' +
        '<td style="border:1px solid #444;padding:6px;text-align:right;white-space:nowrap;">' + escapeHtml_(yen_(amt)) + '</td>' +
      '</tr>';
  }

  var htmlDoc =
    '<!doctype html>' +
    '<html><head><meta charset="utf-8"/>' +
    '<style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#111;}' +
      'h1{font-size:18px;margin:0 0 8px 0;}' +
      '.meta{font-size:12px;margin:0 0 12px 0;}' +
      'table{border-collapse:collapse;width:100%;font-size:12px;}' +
      'th{border:1px solid #444;padding:6px;background:#f0f0f0;text-align:left;}' +
      'td{border:1px solid #444;padding:6px;}' +
      '.right{text-align:right;}' +
      '.summary{margin-top:10px;font-size:12px;}' +
    '</style></head><body>' +
      '<h1>発注依頼（楽天用）</h1>' +
      '<div class="meta">' +
        '<div><b>発注ID:</b> ' + escapeHtml_(poId) + '</div>' +
        '<div><b>発注日:</b> ' + escapeHtml_(sentDate) + '</div>' +
        (supplierVal ? '<div><b>サプライヤー:</b> ' + escapeHtml_(supplierVal) + '</div>' : '') +
        (noteVal ? '<div><b>備考:</b> ' + escapeHtml_(noteVal) + '</div>' : '') +
      '</div>' +
      '<table>' +
        '<thead><tr>' +
          '<th>発注ID</th>' +
          '<th>商品コード</th>' +
          '<th class="right">数量(個)</th>' +
          '<th class="right">単価</th>' +
          '<th class="right">合計額</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div class="summary">' +
        '<div><b>発注件数:</b> ' + escapeHtml_(String(lines.length)) + '件</div>' +
        '<div><b>合計数量:</b> ' + escapeHtml_(String(totalQty)) + '個</div>' +
        '<div><b>合計発注額:</b> ' + escapeHtml_(yen_(totalAmount)) + '</div>' +
      '</div>' +
    '</body></html>';

  var blob = HtmlService.createHtmlOutput(htmlDoc).getBlob().getAs('application/pdf');
  return blob;
}

function sendPoEmailOnSent_(poId) {
  var toList = getPoEmailRecipients_();
  if (!toList.length) {
    throw new Error('PO_EMAIL_RECIPIENTS is empty');
  }

  // 既存の詳細取得を再利用（事故を避ける）
  var detail = poDetail_(poId);
  if (!detail || !detail.ok) throw new Error('po not found for email: ' + poId);
  var header = detail.header || {};
  var lines = detail.lines || [];

  var sentDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var subject = '【発注依頼】楽天用 - ' + sentDate + ' (' + lines.length + '件)';

  var supplierVal = toStringSafe(header.supplier);
  var noteVal = toStringSafe(header.note);

  var totalQty = 0;
  var totalAmount = 0;
  var rowsHtml = '';
  for (var k = 0; k < lines.length; k++) {
    var ln = lines[k];
    var qty = Number(ln.qty || 0);
    var unitCost = ln.unit_cost !== undefined ? Number(ln.unit_cost) : 0;
    var amt = qty * unitCost;
    totalQty += qty;
    totalAmount += amt;
    rowsHtml +=
      '<tr>' +
        '<td style="border:1px solid #ddd;padding:6px;white-space:nowrap;">' + escapeHtml_(poId) + '</td>' +
        '<td style="border:1px solid #ddd;padding:6px;white-space:nowrap;">' + escapeHtml_(ln.internal_id) + '</td>' +
        '<td style="border:1px solid #ddd;padding:6px;text-align:right;white-space:nowrap;">' + escapeHtml_(String(qty)) + '</td>' +
        '<td style="border:1px solid #ddd;padding:6px;text-align:right;white-space:nowrap;">' + escapeHtml_(yen_(unitCost)) + '</td>' +
        '<td style="border:1px solid #ddd;padding:6px;text-align:right;white-space:nowrap;">' + escapeHtml_(yen_(amt)) + '</td>' +
      '</tr>';
  }

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;">' +
      '<h2 style="margin:0 0 8px 0;">発注依頼</h2>' +
      '<p style="margin:0 0 12px 0;">以下の内容で発注をお願いします。</p>' +
      '<div style="margin:0 0 12px 0;font-size:13px;color:#333;">' +
        '<div><b>発注ID:</b> ' + escapeHtml_(poId) + '</div>' +
        '<div><b>発注日:</b> ' + escapeHtml_(sentDate) + '</div>' +
        (supplierVal ? '<div><b>サプライヤー:</b> ' + escapeHtml_(supplierVal) + '</div>' : '') +
        (noteVal ? '<div><b>備考:</b> ' + escapeHtml_(noteVal) + '</div>' : '') +
      '</div>' +
      '<table style="border-collapse:collapse;width:100%;font-size:13px;">' +
        '<thead>' +
          '<tr style="background:#f5f5f5;">' +
            '<th style="border:1px solid #ddd;padding:6px;text-align:left;">発注ID</th>' +
            '<th style="border:1px solid #ddd;padding:6px;text-align:left;">商品コード</th>' +
            '<th style="border:1px solid #ddd;padding:6px;text-align:right;">数量(個)</th>' +
            '<th style="border:1px solid #ddd;padding:6px;text-align:right;">単価</th>' +
            '<th style="border:1px solid #ddd;padding:6px;text-align:right;">合計額</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div style="margin-top:12px;font-size:13px;">' +
        '<div><b>発注件数:</b> ' + escapeHtml_(String(lines.length)) + '件</div>' +
        '<div><b>合計数量:</b> ' + escapeHtml_(String(totalQty)) + '個</div>' +
        '<div><b>合計発注額:</b> ' + escapeHtml_(yen_(totalAmount)) + '</div>' +
      '</div>' +
    '</div>';

  var bodyText =
    '発注依頼\n' +
    '発注ID: ' + poId + '\n' +
    '発注日: ' + sentDate + '\n' +
    (supplierVal ? 'サプライヤー: ' + supplierVal + '\n' : '') +
    (noteVal ? '備考: ' + noteVal + '\n' : '') +
    '\n' +
    '件数: ' + lines.length + '\n' +
    '合計数量: ' + totalQty + '\n' +
    '合計発注額: ' + Math.round(totalAmount) + '\n';

  // 添付（CSV + PDF）
  var csv = buildPoCsv_(poId, sentDate, supplierVal, noteVal, lines);
  var csvName = 'po_' + poId + '_' + sentDate + '.csv';
  var csvBlob = Utilities.newBlob(csv, 'text/csv', csvName);
  // PDFはHTMLをPDF化（メール本文とほぼ同等の表を添付）
  var pdfName = 'po_' + poId + '_' + sentDate + '.pdf';
  var pdfBlob = buildPoPdfBlob_(poId, sentDate, supplierVal, noteVal, lines, totalQty, totalAmount);
  pdfBlob.setName(pdfName);

  MailApp.sendEmail({
    to: toList.join(','),
    subject: subject,
    body: bodyText,
    htmlBody: html,
    attachments: [csvBlob, pdfBlob],
  });
}

function poDelete_(poId) {
  if (!poId) throw new Error('po_id is required');

  var lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    // statusチェック（sentは事故防止で削除不可）
    var headerT = readTable_('po_header');
    requireCols(headerT.header, ['po_id', 'status'], 'po_header');
    var status = null;
    for (var i = 0; i < headerT.rows.length; i++) {
      var r = headerT.rows[i];
      if (toStringSafe(r[headerT.header['po_id']]) === toStringSafe(poId)) {
        status = toStringSafe(r[headerT.header['status']]);
        break;
      }
    }
    if (status === null) return { ok: false, error: 'not_found' };
    // NOTE: sent も含めて削除可能（運用要望）

    // lines → header の順で削除
    deleteRowsWhere_('po_lines', 'po_id', poId);
    var deletedHeader = deleteRowsWhere_('po_header', 'po_id', poId);
    if (deletedHeader === 0) return { ok: false, error: 'not_found' };
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
