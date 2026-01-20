import { getAccessToken } from './gcp-token';

function getBucketName(): string {
  const bucket = (process.env.GCS_VIEW_BUCKET || '').trim();
  if (!bucket) {
    throw new Error('GCS_VIEW_BUCKET が未設定です（例: rakuten-inventory-views-prod）');
  }
  return bucket;
}

async function fetchGcsObject(path: string): Promise<unknown> {
  const bucket = getBucketName();
  const token = await getAccessToken();

  // JSON API: objects.get?alt=media で中身を取得
  const objectName = encodeURIComponent(path);
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${objectName}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCS取得に失敗しました: ${res.status} ${res.statusText} ${text}`);
  }
  return await res.json();
}

export async function getItemMetricsJson(): Promise<unknown> {
  return await fetchGcsObject('view/item_metrics.json');
}

export async function getMirrorMismatchJson(): Promise<unknown> {
  return await fetchGcsObject('view/mirror_mismatch.json');
}

