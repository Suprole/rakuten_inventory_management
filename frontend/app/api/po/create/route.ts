import { NextResponse } from 'next/server';
import { poCreate } from '@/lib/server/gas-po';

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    console.log('[api/po/create] start', { requestId });
    const body = await req.json();
    const json = await poCreate(body);
    console.log('[api/po/create] ok', { requestId });
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/po/create] error', { requestId, message: msg });
    return NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
  }
}

