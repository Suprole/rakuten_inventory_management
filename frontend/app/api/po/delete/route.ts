import { NextResponse } from 'next/server';
import { PoDeletePayloadSchema, PoDeleteResponseSchema } from '@/lib/po-schema';

function getGasConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = (process.env.GAS_WEBAPP_URL || '').trim();
  const apiKey = (process.env.GAS_API_KEY || '').trim();
  if (!baseUrl) throw new Error('GAS_WEBAPP_URL が未設定です');
  if (!apiKey) throw new Error('GAS_API_KEY が未設定です');
  return { baseUrl, apiKey };
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    console.log('[api/po/delete] start', { requestId });
    const body = (await req.json()) as unknown;
    const input = PoDeletePayloadSchema.safeParse(body);
    if (!input.success) {
      const res = NextResponse.json({ ok: false, error: 'bad_request', message: input.error.message, requestId }, { status: 400 });
      res.headers.set('x-request-id', requestId);
      return res;
    }

    const { baseUrl, apiKey } = getGasConfig();
    const url = new URL(baseUrl);
    url.searchParams.set('path', '/po/delete');
    url.searchParams.set('api_key', apiKey); // GAS側制約のため暫定（ブラウザに露出しない）

    const upstream = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.data),
      cache: 'no-store',
    });
    const text = await upstream.text();
    let json: unknown;
    try {
      json = text ? (JSON.parse(text) as unknown) : ({} as unknown);
    } catch {
      throw new Error(`GASの応答がJSONではありません: ${text.slice(0, 200)}`);
    }
    const parsed = PoDeleteResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error(`GAS po/delete の形式が不正です: ${parsed.error.message}`);
    const obj = (json && typeof json === 'object' ? (json as Record<string, unknown>) : null);
    const okVal = obj && typeof obj.ok === 'boolean' ? obj.ok : undefined;
    const errVal = obj && typeof obj.error === 'string' ? obj.error : undefined;
    if (okVal === false) {
      console.warn('[api/po/delete] upstream returned ok:false', { requestId, error: errVal });
    } else {
      console.log('[api/po/delete] ok', { requestId });
    }
    const res = NextResponse.json(json, { status: 200 });
    res.headers.set('x-request-id', requestId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/po/delete] error', { requestId, message: msg });
    const res = NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
    res.headers.set('x-request-id', requestId);
    return res;
  }
}

