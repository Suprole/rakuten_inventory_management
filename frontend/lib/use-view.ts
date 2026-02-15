import { fetchItemMetrics, fetchListingSnapshots, fetchMirrorMismatches, fetchUnmappedListings, fetchYahooUnmappedListings } from './view-client';
import type { ItemMetric, ListingSnapshot, MirrorMismatch, UnmappedListing, YahooUnmappedListing } from './view-schema';
import { useRemoteData } from './use-remote';

type Base<T> = {
  data?: T;
  lastSuccessAt?: number;
  isRevalidating: boolean;
  refresh: () => void;
};

export type LoadState<T> =
  | (Base<T> & { status: 'loading' })
  | (Base<T> & { status: 'success'; data: T })
  | (Base<T> & { status: 'error'; error: string });

export function useItemMetrics(): LoadState<ItemMetric[]> {
  const s = useRemoteData({
    key: 'view:item-metrics',
    fetcher: fetchItemMetrics,
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
  if (s.status === 'success') {
    return { status: 'success', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  if (s.status === 'error') {
    return { status: 'error', error: s.error || 'unknown_error', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  return { status: 'loading', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
}

export function useMirrorMismatches(): LoadState<MirrorMismatch[]> {
  const s = useRemoteData({
    key: 'view:mirror-mismatch',
    fetcher: fetchMirrorMismatches,
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
  if (s.status === 'success') {
    return { status: 'success', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  if (s.status === 'error') {
    return { status: 'error', error: s.error || 'unknown_error', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  return { status: 'loading', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
}

export function useUnmappedListings(): LoadState<UnmappedListing[]> {
  const s = useRemoteData({
    key: 'view:unmapped-listings',
    fetcher: fetchUnmappedListings,
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
  if (s.status === 'success') {
    return { status: 'success', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  if (s.status === 'error') {
    return { status: 'error', error: s.error || 'unknown_error', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  return { status: 'loading', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
}

export function useYahooUnmappedListings(): LoadState<YahooUnmappedListing[]> {
  const s = useRemoteData({
    key: 'view:yahoo-unmapped-listings',
    fetcher: fetchYahooUnmappedListings,
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
  if (s.status === 'success') {
    return { status: 'success', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  if (s.status === 'error') {
    return { status: 'error', error: s.error || 'unknown_error', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  return { status: 'loading', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
}

export function useListingSnapshots(): LoadState<ListingSnapshot[]> {
  const s = useRemoteData({
    key: 'view:listing-snapshot',
    fetcher: fetchListingSnapshots,
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
  if (s.status === 'success') {
    return { status: 'success', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  if (s.status === 'error') {
    return { status: 'error', error: s.error || 'unknown_error', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
  }
  return { status: 'loading', data: s.data, refresh: s.refresh, isRevalidating: s.isRevalidating, lastSuccessAt: s.lastSuccessAt };
}

