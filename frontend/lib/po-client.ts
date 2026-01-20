import {
  PoCreatePayloadSchema,
  PoCreateResponseSchema,
  PoDeletePayloadSchema,
  PoDeleteResponseSchema,
  PoDetailResponseSchema,
  PoListResponseSchema,
  PoUpdateStatusPayloadSchema,
  PoUpdateStatusResponseSchema,
  type PoCreatePayload,
} from './po-schema';

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`APIの応答がJSONではありません: ${text.slice(0, 200)}`);
  }
}

export async function fetchPoList() {
  const res = await fetch('/api/po/list', { cache: 'no-store' });
  const json = await parseJson(res);
  if (!res.ok) {
    console.error('[po-client] /api/po/list http_error', { status: res.status, json });
  }
  const parsed = PoListResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('[po-client] /api/po/list schema_error', { error: parsed.error.message, json });
    throw new Error(`PO一覧の形式が不正です: ${parsed.error.message}`);
  }
  if (!parsed.data.ok) {
    console.error('[po-client] /api/po/list api_error', parsed.data);
    throw new Error(parsed.data.message || parsed.data.error);
  }
  return parsed.data.items;
}

export async function fetchPoDetail(poId: string) {
  const res = await fetch(`/api/po/detail?po_id=${encodeURIComponent(poId)}`, { cache: 'no-store' });
  const json = await parseJson(res);
  if (!res.ok) {
    console.error('[po-client] /api/po/detail http_error', { status: res.status, poId, json });
  }
  const parsed = PoDetailResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('[po-client] /api/po/detail schema_error', { error: parsed.error.message, poId, json });
    throw new Error(`PO詳細の形式が不正です: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function createPo(payload: PoCreatePayload) {
  const input = PoCreatePayloadSchema.safeParse(payload);
  if (!input.success) throw new Error(`作成リクエストが不正です: ${input.error.message}`);

  const res = await fetch('/api/po/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input.data),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    console.error('[po-client] /api/po/create http_error', { status: res.status, json });
  }
  const parsed = PoCreateResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('[po-client] /api/po/create schema_error', { error: parsed.error.message, json });
    throw new Error(`PO作成の形式が不正です: ${parsed.error.message}`);
  }
  if (!parsed.data.ok) throw new Error(parsed.data.message || parsed.data.error);
  return parsed.data.po_id;
}

export async function updatePoStatus(payload: { po_id: string; status: 'draft' | 'sent' | 'cancelled' }) {
  const input = PoUpdateStatusPayloadSchema.safeParse(payload);
  if (!input.success) throw new Error(`更新リクエストが不正です: ${input.error.message}`);

  const res = await fetch('/api/po/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input.data),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    console.error('[po-client] /api/po/update-status http_error', { status: res.status, json });
  }
  const parsed = PoUpdateStatusResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('[po-client] /api/po/update-status schema_error', { error: parsed.error.message, json });
    throw new Error(`ステータス更新の形式が不正です: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function deletePo(payload: { po_id: string }) {
  const input = PoDeletePayloadSchema.safeParse(payload);
  if (!input.success) throw new Error(`削除リクエストが不正です: ${input.error.message}`);

  const res = await fetch('/api/po/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input.data),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    console.error('[po-client] /api/po/delete http_error', { status: res.status, json });
  }
  const parsed = PoDeleteResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('[po-client] /api/po/delete schema_error', { error: parsed.error.message, json });
    throw new Error(`PO削除の形式が不正です: ${parsed.error.message}`);
  }
  if (!parsed.data.ok) {
    const msg = 'message' in parsed.data ? parsed.data.message : undefined;
    throw new Error(msg || parsed.data.error);
  }
  return parsed.data;
}
