import { NextResponse } from 'next/server';
import { poList } from '@/lib/server/gas-po';

export async function GET() {
  try {
    const json = await poList();
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: 'upstream_error', message: msg }, { status: 500 });
  }
}

