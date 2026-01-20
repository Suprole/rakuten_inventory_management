import {
  PoCreatePayloadSchema,
  PoCreateResponseSchema,
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
  const parsed = PoListResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`PO一覧の形式が不正です: ${parsed.error.message}`);
  if (!parsed.data.ok) throw new Error(parsed.data.message || parsed.data.error);
  return parsed.data.items;
}

export async function fetchPoDetail(poId: string) {
  const res = await fetch(`/api/po/detail?po_id=${encodeURIComponent(poId)}`, { cache: 'no-store' });
  const json = await parseJson(res);
  const parsed = PoDetailResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`PO詳細の形式が不正です: ${parsed.error.message}`);
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
  const parsed = PoCreateResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`PO作成の形式が不正です: ${parsed.error.message}`);
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
  const parsed = PoUpdateStatusResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`ステータス更新の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

