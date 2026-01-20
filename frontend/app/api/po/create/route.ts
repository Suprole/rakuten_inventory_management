import { NextResponse } from 'next/server';
import { poCreate } from '@/lib/server/gas-po';

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    console.log('[api/po/create] start', { requestId });
    const body = await req.json();
    const json = await poCreate(body);
    const obj = (json && typeof json === 'object' ? (json as Record<string, unknown>) : null);
    const okVal = obj && typeof obj.ok === 'boolean' ? obj.ok : undefined;
    const errVal = obj && typeof obj.error === 'string' ? obj.error : undefined;
    if (okVal === false) {
      console.warn('[api/po/create] upstream returned ok:false', { requestId, error: errVal });
    } else {
      console.log('[api/po/create] ok', { requestId });
    }
    const res = NextResponse.json(json, { status: 200 });
    res.headers.set('x-request-id', requestId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/po/create] error', { requestId, message: msg });
    const res = NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
    res.headers.set('x-request-id', requestId);
    return res;
  }
}

