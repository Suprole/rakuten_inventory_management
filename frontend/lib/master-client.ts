import { ItemHandlingListResponseSchema, type ItemHandlingRecord } from './master-schema';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`JSON取得に失敗しました: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchItemHandlingRecords(): Promise<ItemHandlingRecord[]> {
  const data = await fetchJson('/api/master/item-handling');
  const parsed = ItemHandlingListResponseSchema.parse(data);
  return parsed.items ?? [];
}
