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

  // NOTE: api_key等はログに出さない（origin+pathnameだけ）
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
    console.error('[gas-po] non-json response', { requestId, path: params.path, method: params.method, safeUrl, status: res.status });
    throw new Error(`GASの応答がJSONではありません: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    console.error('[gas-po] upstream error', { requestId, path: params.path, method: params.method, safeUrl, status: res.status, statusText: res.statusText });
    throw new Error(`GAS API失敗: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  return json as T;
}

import { PoDetailResponseSchema, PoListResponseSchema, PoCreatePayloadSchema, PoCreateResponseSchema, PoUpdateStatusPayloadSchema, PoUpdateStatusResponseSchema, PoDeletePayloadSchema, PoDeleteResponseSchema } from '@/lib/po-schema';

export async function poList(): Promise<unknown> {
  const json = await gasFetch<unknown>({ path: '/po/list', method: 'GET' });
  const parsed = PoListResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`GAS po/list の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

export async function poDetail(poId: string): Promise<unknown> {
  const json = await gasFetch<unknown>({ path: '/po/detail', method: 'GET', query: { po_id: poId } });
  const parsed = PoDetailResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`GAS po/detail の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

export async function poCreate(payload: {
  supplier?: string;
  note?: string;
  lines: Array<{
    internal_id: string;
    qty: number;
    unit_cost?: number;
    basis_need_qty?: number;
    basis_days_of_cover?: number;
  }>;
}): Promise<unknown> {
  const input = PoCreatePayloadSchema.safeParse(payload);
  if (!input.success) throw new Error(`po/create の入力が不正です: ${input.error.message}`);
  const json = await gasFetch<unknown>({ path: '/po/create', method: 'POST', body: input.data });
  const parsed = PoCreateResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`GAS po/create の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

export async function poUpdateStatus(payload: { po_id: string; status: 'draft' | 'sent' | 'cancelled' }): Promise<unknown> {
  const input = PoUpdateStatusPayloadSchema.safeParse(payload);
  if (!input.success) throw new Error(`po/update_status の入力が不正です: ${input.error.message}`);
  const json = await gasFetch<unknown>({ path: '/po/update_status', method: 'POST', body: input.data });
  const parsed = PoUpdateStatusResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`GAS po/update_status の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

export async function poDelete(payload: { po_id: string }): Promise<unknown> {
  const input = PoDeletePayloadSchema.safeParse(payload);
  if (!input.success) throw new Error(`po/delete の入力が不正です: ${input.error.message}`);
  const json = await gasFetch<unknown>({ path: '/po/delete', method: 'POST', body: input.data });
  const parsed = PoDeleteResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`GAS po/delete の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}
