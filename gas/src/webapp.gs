function jsonResponse(status, body) {
  var out = ContentService.createTextOutput(JSON.stringify(body));
  out.setMimeType(ContentService.MimeType.JSON);
  // GASのContentServiceではHTTPステータスを直接セットできないため、bodyにok/errorを含める運用に寄せる
  return out;
}

function getApiKeyFromRequest(e) {
  // doGet/doPostのイベントにはheadersが載らないため、暫定的に query `api_key` を許容。
  // 本番はVercelのRoute Handler経由で `X-API-KEY` を付与する設計を推奨。
  var apiKey = e && e.parameter ? e.parameter.api_key : undefined;
  return typeof apiKey === 'string' && apiKey.length > 0 ? apiKey : undefined;
}

function requireAuth(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_KEY') || '';
  var got = getApiKeyFromRequest(e) || '';
  if (!expected || got !== expected) {
    return jsonResponse(401, { ok: false, error: 'unauthorized' });
  }
  return { ok: true };
}

function handleApi(method, e) {
  var auth = requireAuth(e);
  if (auth && auth.getContent) return auth;

  var path = (e && e.parameter && e.parameter.path ? e.parameter.path : '').toString();
  try {
    // ルーティングは `?path=/po/list` のように queryで受ける想定（GAS WebAppの制約回避）
    if (method === 'GET' && path === '/po/list') {
      return jsonResponse(200, poList_());
    }
    if (method === 'GET' && path === '/po/detail') {
      var poId = e && e.parameter ? e.parameter.po_id : '';
      return jsonResponse(200, poDetail_(poId));
    }
    if (method === 'POST' && path === '/po/create') {
      var body = {};
      if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
      return jsonResponse(200, poCreate_(body));
    }
    if (method === 'POST' && path === '/po/update_status') {
      var body2 = {};
      if (e && e.postData && e.postData.contents) body2 = JSON.parse(e.postData.contents);
      return jsonResponse(200, poUpdateStatus_(body2.po_id, body2.status));
    }

    return jsonResponse(404, { ok: false, error: 'not_found', path: path, method: method });
  } catch (err) {
    var msg = err && err.message ? err.message : String(err);
    return jsonResponse(500, { ok: false, error: 'internal_error', message: msg });
  }
}

