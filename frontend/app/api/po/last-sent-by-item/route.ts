import { NextResponse } from 'next/server';
import { poLastSentByItem } from '@/lib/server/gas-po';

export const runtime = 'nodejs';

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    console.log('[api/po/last-sent-by-item] start', { requestId });
    const json = await poLastSentByItem();
    const obj = (json && typeof json === 'object' ? (json as Record<string, unknown>) : null);
    const okVal = obj && typeof obj.ok === 'boolean' ? obj.ok : undefined;
    const errVal = obj && typeof obj.error === 'string' ? obj.error : undefined;
    if (okVal === false) {
      console.warn('[api/po/last-sent-by-item] upstream returned ok:false', { requestId, error: errVal });
    } else {
      console.log('[api/po/last-sent-by-item] ok', { requestId });
    }
    const res = NextResponse.json(json, { status: 200 });
    // 二重発注防止のため、ここはキャッシュしない（常に最新を取りに行く）
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('x-request-id', requestId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/po/last-sent-by-item] error', { requestId, message: msg });
    const res = NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('x-request-id', requestId);
    return res;
  }
}

