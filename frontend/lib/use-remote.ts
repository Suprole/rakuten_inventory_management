import { useCallback, useEffect, useMemo, useState } from 'react';

type Listener = () => void;

type Entry<T> = {
  data?: T;
  error?: string;
  lastSuccessAt?: number;
  isFetching: boolean;
  inFlight?: Promise<void>;
  listeners: Set<Listener>;
};

const store = new Map<string, Entry<unknown>>();

function getEntry<T>(key: string): Entry<T> {
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing) return existing;
  const next: Entry<T> = { isFetching: false, listeners: new Set() };
  store.set(key, next as Entry<unknown>);
  return next;
}

function notify(key: string) {
  const entry = store.get(key);
  if (!entry) return;
  for (const l of entry.listeners) l();
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runFetch<T>(key: string, fetcher: () => Promise<T>) {
  const entry = getEntry<T>(key);
  if (entry.inFlight) return entry.inFlight;

  entry.isFetching = true;
  notify(key);

  entry.inFlight = (async () => {
    try {
      const data = await fetcher();
      entry.data = data;
      entry.error = undefined;
      entry.lastSuccessAt = Date.now();
    } catch (e) {
      entry.error = toErrorMessage(e);
    } finally {
      entry.isFetching = false;
      entry.inFlight = undefined;
      notify(key);
    }
  })();

  return entry.inFlight;
}

export function invalidateRemote(key: string) {
  // 次回のrefreshで再取得されるようにする（即時再取得は呼び出し側で）
  const entry = store.get(key);
  if (!entry) return;
  entry.error = entry.error; // no-op（明示的にnotifyしたいだけ）
  notify(key);
}

export type RemoteState<T> =
  | {
      status: 'loading';
      data?: T;
      error?: undefined;
      lastSuccessAt?: number;
      isRevalidating: boolean;
      refresh: () => void;
    }
  | {
      status: 'success';
      data: T;
      error?: undefined;
      lastSuccessAt?: number;
      isRevalidating: boolean;
      refresh: () => void;
    }
  | {
      status: 'error';
      error: string;
      data?: T;
      lastSuccessAt?: number;
      isRevalidating: boolean;
      refresh: () => void;
    };

export function useRemoteData<T>(params: {
  key: string;
  fetcher: () => Promise<T>;
  revalidateOnMount?: boolean;
  revalidateOnFocus?: boolean;
}): RemoteState<T> {
  const { key, fetcher } = params;
  const revalidateOnMount = params.revalidateOnMount ?? true;
  const revalidateOnFocus = params.revalidateOnFocus ?? true;

  const [, bump] = useState(0);

  useEffect(() => {
    const entry = getEntry<T>(key);
    const listener = () => bump((x) => x + 1);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }, [key]);

  const refresh = useCallback(() => {
    void runFetch<T>(key, fetcher);
  }, [key, fetcher]);

  useEffect(() => {
    const entry = getEntry<T>(key);
    if (!revalidateOnMount) return;
    // 初回：データが無ければ必ず取りに行く。あればバックグラウンド再検証。
    if (!entry.inFlight) void runFetch<T>(key, fetcher);
  }, [key, fetcher, revalidateOnMount]);

  useEffect(() => {
    if (!revalidateOnFocus) return;
    const onFocus = () => {
      void runFetch<T>(key, fetcher);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [key, fetcher, revalidateOnFocus]);

  const entry = useMemo(() => getEntry<T>(key), [key]);
  const isRevalidating = entry.isFetching && entry.data !== undefined;

  if (entry.error) {
    return {
      status: 'error',
      error: entry.error,
      data: entry.data,
      lastSuccessAt: entry.lastSuccessAt,
      isRevalidating,
      refresh,
    };
  }

  if (entry.data !== undefined) {
    return {
      status: 'success',
      data: entry.data,
      lastSuccessAt: entry.lastSuccessAt,
      isRevalidating,
      refresh,
    };
  }

  return {
    status: 'loading',
    data: entry.data,
    lastSuccessAt: entry.lastSuccessAt,
    isRevalidating,
    refresh,
  };
}

