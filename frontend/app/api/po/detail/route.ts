import { NextResponse } from 'next/server';
import { poDetail } from '@/lib/server/gas-po';

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const poId = (url.searchParams.get('po_id') || '').trim();
    if (!poId) {
      console.warn('[api/po/detail] bad_request', { requestId });
      return NextResponse.json({ ok: false, error: 'bad_request', message: 'po_id is required', requestId }, { status: 400 });
    }
    console.log('[api/po/detail] start', { requestId, poId });
    const json = await poDetail(poId);
    console.log('[api/po/detail] ok', { requestId, poId });
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/po/detail] error', { requestId, message: msg });
    return NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
  }
}

