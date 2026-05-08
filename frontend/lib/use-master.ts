import { useRemoteData } from './use-remote';
import { fetchItemHandlingRecords } from './master-client';
import type { ItemHandlingRecord } from './master-schema';

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

export function useItemHandlingRecords(): LoadState<ItemHandlingRecord[]> {
  const s = useRemoteData({
    key: 'master:item-handling',
    fetcher: fetchItemHandlingRecords,
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
