import { NextResponse } from 'next/server';
import { getItemMetricsJson } from '@/lib/server/gcs-view';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const json = await getItemMetricsJson();
    return NextResponse.json(json, {
      headers: {
        // Vercel側で短めにキャッシュ（事故防止のためまずは5分）
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

