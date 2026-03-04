import { useRemoteData } from './use-remote';
import { fetchPoDetail, fetchPoLastSentByItem, fetchPoList } from './po-client';

export function usePoList() {
  return useRemoteData({
    key: 'po:list',
    fetcher: fetchPoList,
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
}

export function usePoDetail(poId: string) {
  return useRemoteData({
    key: `po:detail:${poId}`,
    fetcher: () => fetchPoDetail(poId),
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
}

export function usePoLastSentByItem() {
  return useRemoteData({
    key: 'po:last-sent-by-item',
    fetcher: fetchPoLastSentByItem,
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
}

