function readSheetValues(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: spreadsheetId=' + spreadsheetId + ', sheetName=' + sheetName);
  return sheet.getDataRange().getValues();
}

function readActiveSpreadsheetSheetValues(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Master sheet not found: ' + sheetName);
  return sheet.getDataRange().getValues();
}

function indexHeader(headerRow) {
  var idx = {};
  for (var i = 0; i < headerRow.length; i++) {
    var key = String(headerRow[i] || '').trim();
    if (key) idx[key] = i;
  }
  return idx;
}

function requireCols(header, required, context) {
  var missing = [];
  for (var i = 0; i < required.length; i++) {
    var c = required[i];
    if (header[c] === undefined) missing.push(c);
  }
  if (missing.length) throw new Error('Missing required columns (' + context + '): ' + missing.join(', '));
}

function toStringSafe(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

function toNumberSafe(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var n = Number(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : 0;
}

/**
 * 数値変換（不正値は0） + 警告ログ
 * - 仕様：数値不正は0扱い。ただし運用で気付けるようにwarnを出す
 */
function toNumberSafeWarn(v, context) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') {
    if (isFinite(v)) return v;
    Logger.log('[warn] invalid number (non-finite): ' + context + ' value=' + String(v));
    return 0;
  }
  var raw = String(v).trim();
  var n = Number(raw.replace(/,/g, ''));
  if (isFinite(n)) return n;
  Logger.log('[warn] invalid number: ' + context + " value='" + raw + "'");
  return 0;
}

function toBooleanSafe(v) {
  if (typeof v === 'boolean') return v;
  var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function makeListingId(storeId, rakutenItemNo, rakutenSku) {
  return storeId + '|' + rakutenItemNo + '|' + rakutenSku;
}

function makeRakutenKey(rakutenItemNo, rakutenSku) {
  return rakutenItemNo + '|' + rakutenSku;
}

