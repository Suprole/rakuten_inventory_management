import { NextResponse } from 'next/server';
import { poList } from '@/lib/server/gas-po';

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    console.log('[api/po/list] start', { requestId });
    const json = await poList();
    console.log('[api/po/list] ok', { requestId });
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/po/list] error', { requestId, message: msg });
    return NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
  }
}

