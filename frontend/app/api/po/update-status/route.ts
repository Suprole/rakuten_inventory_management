import { NextResponse } from 'next/server';
import { poUpdateStatus } from '@/lib/server/gas-po';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const json = await poUpdateStatus(body);
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: 'upstream_error', message: msg }, { status: 500 });
  }
}

