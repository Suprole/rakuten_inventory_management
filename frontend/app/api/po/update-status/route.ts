import { NextResponse } from 'next/server';
import { poUpdateStatus } from '@/lib/server/gas-po';

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    console.log('[api/po/update-status] start', { requestId });
    const body = await req.json();
    const json = await poUpdateStatus(body);
    console.log('[api/po/update-status] ok', { requestId });
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/po/update-status] error', { requestId, message: msg });
    return NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
  }
}

