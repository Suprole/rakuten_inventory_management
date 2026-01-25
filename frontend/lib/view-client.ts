import {
  ItemMetricsSchema,
  MirrorMismatchesSchema,
  type ItemMetric,
  type MirrorMismatch,
  UnmappedListingsSchema,
  type UnmappedListing,
  ListingSnapshotsSchema,
  type ListingSnapshot,
} from './view-schema';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    // クライアント側は都度取得（サーバー側APIでキャッシュする前提）
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`JSON取得に失敗しました: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchItemMetrics(): Promise<ItemMetric[]> {
  // A案：同一オリジンのRoute Handlerから取得（GCSは非公開でもOK）
  const url = `/api/view/item-metrics`;
  const data = await fetchJson(url);
  return ItemMetricsSchema.parse(data);
}

export async function fetchMirrorMismatches(): Promise<MirrorMismatch[]> {
  const url = `/api/view/mirror-mismatch`;
  const data = await fetchJson(url);
  return MirrorMismatchesSchema.parse(data);
}

export async function fetchUnmappedListings(): Promise<UnmappedListing[]> {
  const url = `/api/view/unmapped-listings`;
  const data = await fetchJson(url);
  return UnmappedListingsSchema.parse(data);
}

export async function fetchListingSnapshots(): Promise<ListingSnapshot[]> {
  const url = `/api/view/listing-snapshot`;
  const data = await fetchJson(url);
  return ListingSnapshotsSchema.parse(data);
}

