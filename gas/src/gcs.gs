var __gcsTokenCache = null; // { scope: string, accessToken: string, expiresAtMs: number }

function base64UrlEncode_(input) {
  var bytes = typeof input === 'string' ? Utilities.newBlob(input).getBytes() : input.getBytes();
  var b64 = Utilities.base64EncodeWebSafe(bytes);
  return b64.replace(/=+$/g, '');
}

function getServiceAccount_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GCS_SERVICE_ACCOUNT_JSON') || '';
  if (!raw) throw new Error('ScriptProperties: GCS_SERVICE_ACCOUNT_JSON が未設定です');
  var parsed = JSON.parse(raw);
  var client_email = parsed.client_email;
  var private_key = parsed.private_key ? String(parsed.private_key).replace(/\\n/g, '\n') : '';
  if (!client_email || !private_key) throw new Error('GCS_SERVICE_ACCOUNT_JSON に client_email/private_key がありません');
  return { client_email: client_email, private_key: private_key };
}

function getBucketName_() {
  var bucket = (PropertiesService.getScriptProperties().getProperty('GCS_VIEW_BUCKET') || '').trim();
  if (!bucket) throw new Error('ScriptProperties: GCS_VIEW_BUCKET が未設定です');
  return bucket;
}

function createJwt_(sa, scope) {
  var tokenUrl = 'https://oauth2.googleapis.com/token';
  var nowSec = Math.floor(Date.now() / 1000);

  var header = { alg: 'RS256', typ: 'JWT' };
  var payload = {
    iss: sa.client_email,
    scope: scope,
    aud: tokenUrl,
    iat: nowSec,
    exp: nowSec + 55 * 60,
  };

  var signingInput = base64UrlEncode_(JSON.stringify(header)) + '.' + base64UrlEncode_(JSON.stringify(payload));
  var signatureBytes = Utilities.computeRsaSha256Signature(signingInput, sa.private_key);
  var signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/g, '');
  return signingInput + '.' + signature;
}

function getAccessToken_(scope) {
  var now = Date.now();
  if (
    __gcsTokenCache &&
    __gcsTokenCache.scope === scope &&
    now < __gcsTokenCache.expiresAtMs - 60 * 1000
  ) {
    return __gcsTokenCache.accessToken;
  }

  var sa = getServiceAccount_();
  var jwt = createJwt_(sa, scope);

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('OAuth token取得に失敗しました: ' + code + ' ' + text);

  var json = JSON.parse(text);
  __gcsTokenCache = {
    scope: scope,
    accessToken: json.access_token,
    expiresAtMs: now + (json.expires_in || 0) * 1000,
  };
  return __gcsTokenCache.accessToken;
}

function gcsUploadMedia_(params) {
  var url =
    'https://storage.googleapis.com/upload/storage/v1/b/' +
    encodeURIComponent(params.bucket) +
    '/o?uploadType=media&name=' +
    encodeURIComponent(params.objectPath);

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: params.contentType,
    payload: params.body,
    headers: { Authorization: 'Bearer ' + params.accessToken },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('GCS upload failed: ' + code + ' ' + res.getContentText());
}

function gcsPatchMetadata_(params) {
  var objectName = encodeURIComponent(params.objectPath);
  var url =
    'https://storage.googleapis.com/storage/v1/b/' +
    encodeURIComponent(params.bucket) +
    '/o/' +
    objectName;

  var body = {};
  if (params.cacheControl) body.cacheControl = params.cacheControl;
  if (params.contentType) body.contentType = params.contentType;

  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + params.accessToken },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('GCS metadata patch failed: ' + code + ' ' + res.getContentText());
}

function uploadViewJson(objectPath, jsonString) {
  var bucket = getBucketName_();
  // NOTE:
  // - uploadType=media は作成はできても、metadata PATCH が scope不足になる環境があるため
  // - ここでは full_control を要求して、patchを確実に通す
  var accessToken = getAccessToken_('https://www.googleapis.com/auth/devstorage.full_control');

  gcsUploadMedia_({
    bucket: bucket,
    objectPath: objectPath,
    contentType: 'application/json; charset=utf-8',
    body: jsonString,
    accessToken: accessToken,
  });

  gcsPatchMetadata_({
    bucket: bucket,
    objectPath: objectPath,
    accessToken: accessToken,
    cacheControl: 'public, max-age=300',
    contentType: 'application/json; charset=utf-8',
  });
}

