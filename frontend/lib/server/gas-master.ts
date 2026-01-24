import { ListingHandlingListResponseSchema, ListingHandlingUpsertPayloadSchema, ListingHandlingUpsertResponseSchema } from '@/lib/master-schema';

function getGasConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = (process.env.GAS_WEBAPP_URL || '').trim();
  const apiKey = (process.env.GAS_API_KEY || '').trim();
  if (!baseUrl) throw new Error('GAS_WEBAPP_URL が未設定です');
  if (!apiKey) throw new Error('GAS_API_KEY が未設定です');
  return { baseUrl, apiKey };
}

async function gasFetch<T>(params: {
  path: string;
  method: 'GET' | 'POST';
  query?: Record<string, string>;
  body?: unknown;
  requestId?: string;
}): Promise<T> {
  const { baseUrl, apiKey } = getGasConfig();
  const requestId = params.requestId || crypto.randomUUID();
  const url = new URL(baseUrl);
  url.searchParams.set('path', params.path);
  url.searchParams.set('api_key', apiKey); // GAS側制約のため暫定（ブラウザに露出しない）
  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      url.searchParams.set(k, v);
    }
  }

  const safeUrl = (() => {
    try {
      const u = new URL(baseUrl);
      return `${u.origin}${u.pathname}`;
    } catch {
      return '(invalid GAS_WEBAPP_URL)';
    }
  })();

  const res = await fetch(url.toString(), {
    method: params.method,
    headers: { 'Content-Type': 'application/json' },
    body: params.method === 'POST' ? JSON.stringify(params.body ?? {}) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? (JSON.parse(text) as unknown) : ({} as unknown);
  } catch {
    console.error('[gas-master] non-json response', { requestId, path: params.path, method: params.method, safeUrl, status: res.status });
    throw new Error(`GASの応答がJSONではありません: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    console.error('[gas-master] upstream error', { requestId, path: params.path, method: params.method, safeUrl, status: res.status, statusText: res.statusText });
    throw new Error(`GAS API失敗: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  return json as T;
}

export async function upsertListingHandling(params: {
  payload: unknown;
  updatedBy?: string;
  requestId?: string;
}): Promise<unknown> {
  const input = ListingHandlingUpsertPayloadSchema.safeParse(params.payload);
  if (!input.success) throw new Error(`listing_handling/upsert の入力が不正です: ${input.error.message}`);

  const body = {
    ...input.data,
    updated_by: (params.updatedBy || '').trim(),
  };

  const json = await gasFetch<unknown>({
    path: '/master/listing_handling/upsert',
    method: 'POST',
    body,
    requestId: params.requestId,
  });

  const parsed = ListingHandlingUpsertResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`GAS listing_handling/upsert の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

export async function listListingHandling(params: {
  handlingStatus?: 'normal' | 'unavailable';
  requestId?: string;
}): Promise<unknown> {
  const json = await gasFetch<unknown>({
    path: '/master/listing_handling/list',
    method: 'GET',
    query: params.handlingStatus ? { handling_status: params.handlingStatus } : undefined,
    requestId: params.requestId,
  });
  const parsed = ListingHandlingListResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`GAS listing_handling/list の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

