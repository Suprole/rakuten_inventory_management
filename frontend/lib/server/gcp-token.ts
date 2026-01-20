type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

import crypto from 'crypto';

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getServiceAccountJson(): { client_email: string; private_key: string } {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON || '';
  if (!raw) {
    throw new Error('GCP_SERVICE_ACCOUNT_JSON が未設定です（Vercel環境変数に設定してください）');
  }
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  const client_email = parsed.client_email;
  const private_key = parsed.private_key?.replace(/\\n/g, '\n');
  if (!client_email || !private_key) {
    throw new Error('GCP_SERVICE_ACCOUNT_JSON に client_email/private_key がありません');
  }
  return { client_email, private_key };
}

function createJwt(params: {
  clientEmail: string;
  privateKeyPem: string;
  scope: string;
  tokenUrl: string;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: params.clientEmail,
    scope: params.scope,
    aud: params.tokenUrl,
    iat: nowSec,
    exp: nowSec + 60 * 55, // 55分
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(params.privateKeyPem);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAtMs - 60_000) {
    return tokenCache.accessToken;
  }

  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const scope = 'https://www.googleapis.com/auth/devstorage.read_only';
  const sa = getServiceAccountJson();
  const jwt = createJwt({
    clientEmail: sa.client_email,
    privateKeyPem: sa.private_key,
    scope,
    tokenUrl,
  });

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token取得に失敗しました: ${res.status} ${res.statusText} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now + json.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

