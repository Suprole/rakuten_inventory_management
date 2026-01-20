import { NextResponse } from 'next/server';
import { poDetail } from '@/lib/server/gas-po';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const poId = (url.searchParams.get('po_id') || '').trim();
    if (!poId) {
      return NextResponse.json({ ok: false, error: 'bad_request', message: 'po_id is required' }, { status: 400 });
    }
    const json = await poDetail(poId);
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: 'upstream_error', message: msg }, { status: 500 });
  }
}

