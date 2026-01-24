import { NextResponse } from 'next/server';
import { listListingHandling, upsertListingHandling } from '@/lib/server/gas-master';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/server/auth';

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    console.log('[api/master/listing-handling] list start', { requestId });
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || '').trim();
    const handlingStatus = status === 'unavailable' ? 'unavailable' : status === 'normal' ? 'normal' : undefined;
    const json = await listListingHandling({ handlingStatus, requestId });
    const res = NextResponse.json(json, { status: 200 });
    res.headers.set('x-request-id', requestId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/master/listing-handling] list error', { requestId, message: msg });
    const res = NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
    res.headers.set('x-request-id', requestId);
    return res;
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    console.log('[api/master/listing-handling] start', { requestId });
    const session = await getServerSession(authOptions);
    const email = session?.user?.email || '';
    const body = await req.json();
    const json = await upsertListingHandling({ payload: body, updatedBy: email, requestId });
    const res = NextResponse.json(json, { status: 200 });
    res.headers.set('x-request-id', requestId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/master/listing-handling] error', { requestId, message: msg });
    const res = NextResponse.json({ ok: false, error: 'upstream_error', message: msg, requestId }, { status: 500 });
    res.headers.set('x-request-id', requestId);
    return res;
  }
}

