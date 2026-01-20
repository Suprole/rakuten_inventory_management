import { NextResponse } from 'next/server';
import { poDetail } from '@/lib/server/gas-po';

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const poId = (url.searchParams.get('po_id') || '').trim();
    if (!poId) {
      console.warn('[api/po/detail] bad_request', { requestId });
      const res = NextResponse.json({ ok: false, error: 'bad_request', message: 'po_id is required', requestId }, { status: 400 });
      res.headers.set('x-request-id', requestId);
      return res;
    }
    console.log('[api/po/detail] start', { requestId, poId });
    const json = await poDetail(poId);
    const obj = (json && typeof json === 'object' ? (json as Record<string, unknown>) : null);
    const okVal = obj && typeof obj.ok === 'boolean' ? obj.ok : undefined;
    const errVal = obj && typeof obj.error === 'string' ? obj.error : undefined;
    if (okVal === false) {
      console.warn('[api/po/detail] upstream returned ok:false', { requestId, poId, error: errVal });
    } else {
      console.log('[api/po/detail] ok', { requestId, poId });
    }
    const res = NextResponse.json(json, { status: 200 });
    res.headers.set('x-request-id', requestId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/po/detail] error', { requestId, message: msg });
    const res = NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
    res.headers.set('x-request-id', requestId);
    return res;
  }
}

