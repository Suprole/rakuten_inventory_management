import { NextResponse } from 'next/server';
import { getYahooUnmappedListingsJson } from '@/lib/server/gcs-view';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const json = await getYahooUnmappedListingsJson();
    return NextResponse.json(json, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

