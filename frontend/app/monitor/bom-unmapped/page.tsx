'use client';

import { useEffect, useMemo, useState } from 'react';
import { Navigation } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useUnmappedListings } from '@/lib/use-view';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function BomUnmappedMonitorPage() {
  const s = useUnmappedListings();
  const items = s.data ?? [];

  const [excluded, setExcluded] = useState<Array<{
    listing_id: string;
    store_id?: string;
    rakuten_item_no?: string;
    rakuten_sku?: string;
    note?: string;
    updated_at?: string;
    updated_by?: string;
  }>>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadExcluded() {
      try {
        const res = await fetch('/api/master/listing-handling?status=unavailable', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json || typeof json !== 'object' || (json as any).ok === false) return;
        const arr = Array.isArray((json as any).items) ? (json as any).items : [];
        if (cancelled) return;
        setExcluded(arr);
      } catch {
        // no-op
      }
    }
    loadExcluded();
    return () => {
      cancelled = true;
    };
  }, []);

  const excludedIdSet = useMemo(() => new Set(excluded.map((x) => x.listing_id)), [excluded]);

  const unmappedItems = useMemo(() => {
    // NOTE: ETL未反映でも、画面上は「取り扱い不可」を除外する
    return items.filter((x) => !excludedIdSet.has(x.listing_id));
  }, [items, excludedIdSet]);

  const sorted = useMemo(() => [...unmappedItems].sort((a, b) => {
    // 優先度: 在庫あり → 売上あり → 件数
    const aHasStock = a.stock_qty > 0 ? 1 : 0;
    const bHasStock = b.stock_qty > 0 ? 1 : 0;
    if (aHasStock !== bHasStock) return bHasStock - aHasStock;
    const aSales = (a.this_month_sales || 0) + (a.last_month_sales || 0);
    const bSales = (b.this_month_sales || 0) + (b.last_month_sales || 0);
    if (aSales !== bSales) return bSales - aSales;
    return b.stock_qty - a.stock_qty;
  }), [unmappedItems]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;
  const allVisibleIds = useMemo(() => sorted.map((x) => x.listing_id), [sorted]);
  const allVisibleSelected = useMemo(
    () => allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedSet.has(id)),
    [allVisibleIds, selectedSet]
  );

  function toggleSelectOne(id: string, checked: boolean) {
    if (checked && selectedCount >= 50 && !selectedSet.has(id)) {
      setLastMessage('一括操作は最大50件です。先に実行するか、選択を減らしてください。');
      return;
    }
    setLastMessage('');
    setSelectedIds((prev) => {
      const has = prev.includes(id);
      if (checked) return has ? prev : [...prev, id];
      return has ? prev.filter((x) => x !== id) : prev;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setLastMessage('');
    if (!checked) {
      setSelectedIds((prev) => prev.filter((id) => !allVisibleIds.includes(id)));
      return;
    }
    const merged = Array.from(new Set([...selectedIds, ...allVisibleIds]));
    if (merged.length > 50) {
      setSelectedIds(merged.slice(0, 50));
      setLastMessage('一括操作は最大50件です。先頭50件まで選択しました。');
      return;
    }
    setSelectedIds(merged);
  }

  async function bulkMarkUnavailable() {
    if (selectedIds.length === 0) return;
    setPendingId('bulk');
    setLastMessage('');
    try {
      const targets = sorted.filter((x) => selectedSet.has(x.listing_id)).slice(0, 50);
      const res = await fetch('/api/master/listing-handling/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handling_status: 'unavailable',
          items: targets.map((x) => ({
            listing_id: x.listing_id,
            store_id: x.store_id,
            rakuten_item_no: x.rakuten_item_no,
            rakuten_sku: x.rakuten_sku,
            handling_status: 'unavailable',
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = (json && typeof json === 'object' && (json as any).message)
          ? String((json as any).message)
          : '一括更新に失敗しました';
        throw new Error(msg);
      }

      const updated = json && typeof json === 'object' && (json as any).updated !== undefined ? Number((json as any).updated) : targets.length;
      const failed = json && typeof json === 'object' && (json as any).failed !== undefined ? Number((json as any).failed) : 0;

      // 画面上は即時除外（excludedに追加）
      setExcluded((prev) => [
        ...targets.map((x) => ({
          listing_id: x.listing_id,
          store_id: x.store_id,
          rakuten_item_no: x.rakuten_item_no,
          rakuten_sku: x.rakuten_sku,
        })),
        ...prev,
      ]);
      setSelectedIds([]);
      setLastMessage(`一括で取り扱い不可にしました: 成功${updated}件 / 失敗${failed}件`);
    } finally {
      setPendingId(null);
    }
  }

  async function markUnavailable(x: (typeof items)[number]) {
    setPendingId(x.listing_id);
    setLastMessage('');
    try {
      const res = await fetch('/api/master/listing-handling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: x.listing_id,
          store_id: x.store_id,
          rakuten_item_no: x.rakuten_item_no,
          rakuten_sku: x.rakuten_sku,
          handling_status: 'unavailable',
        }),
      });
      const json = await res.json();
      if (!res.ok || (json && typeof json === 'object' && (json as any).ok === false)) {
        const msg = (json && typeof json === 'object' && (json as any).message) ? String((json as any).message) : '更新に失敗しました';
        throw new Error(msg);
      }
      setLastMessage('取り扱い不可に設定しました（画面上は即時除外）。ETL後に監視データにも反映されます。');
      setExcluded((prev) => [
        {
          listing_id: x.listing_id,
          store_id: x.store_id,
          rakuten_item_no: x.rakuten_item_no,
          rakuten_sku: x.rakuten_sku,
        },
        ...prev,
      ]);
    } finally {
      setPendingId(null);
    }
  }

  async function unmarkUnavailable(x: { listing_id: string; store_id?: string; rakuten_item_no?: string; rakuten_sku?: string }) {
    setPendingId(x.listing_id);
    setLastMessage('');
    try {
      const res = await fetch('/api/master/listing-handling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: x.listing_id,
          store_id: x.store_id,
          rakuten_item_no: x.rakuten_item_no,
          rakuten_sku: x.rakuten_sku,
          handling_status: 'normal',
        }),
      });
      const json = await res.json();
      if (!res.ok || (json && typeof json === 'object' && (json as any).ok === false)) {
        const msg = (json && typeof json === 'object' && (json as any).message) ? String((json as any).message) : '更新に失敗しました';
        throw new Error(msg);
      }
      setExcluded((prev) => prev.filter((i) => i.listing_id !== x.listing_id));
      setLastMessage('取り扱い不可を解除しました（画面上は即時反映）。ETL後に監視データにも反映されます。');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <AlertCircle className="h-8 w-8" />
            BOM未紐付け監視
          </h1>
          <p className="mt-2 text-muted-foreground">
            BOM（セット構成）に紐づかず、社内IDの在庫・発注計算に入っていないSKUを検知
          </p>
        </div>

        {s.status === 'error' && (
          <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span>データ取得に失敗しました: {s.error}</span>
              <Button variant="outline" size="sm" onClick={s.refresh} className="bg-transparent">
                再試行
              </Button>
            </div>
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <Card className={unmappedItems.length > 0 ? 'border-destructive' : 'border-success'}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {unmappedItems.length > 0 ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    検出数
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    検出数
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn('text-3xl font-bold', unmappedItems.length > 0 ? 'text-destructive' : 'text-success')}>
                {s.status === 'loading' ? '-' : unmappedItems.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {unmappedItems.length > 0 ? 'BOM未紐付けのSKUが存在します' : 'BOM未紐付けは検出されませんでした'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                対応方針
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {unmappedItems.length > 0 ? (
                <Badge className="bg-destructive text-destructive-foreground text-base">
                  要整備
                </Badge>
              ) : (
                <Badge className="bg-success text-success-foreground text-base">
                  正常
                </Badge>
              )}
              <p className="text-xs text-muted-foreground">
                `listings` と `bom` を整備し、翌日のETLで解消を確認してください。
              </p>
            </CardContent>
          </Card>
        </div>

        {lastMessage && (
          <div className="mb-6 rounded-md border border-border bg-card p-3 text-sm text-foreground">
            {lastMessage}
          </div>
        )}

        <Tabs defaultValue="unmapped" className="mt-2">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="unmapped">
              未紐付け
              <span className="ml-1 rounded bg-background px-1.5 py-0.5 text-xs text-foreground">
                {unmappedItems.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="excluded">
              除外中
              <span className="ml-1 rounded bg-background px-1.5 py-0.5 text-xs text-foreground">
                {excluded.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unmapped">
            {s.status === 'loading' ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">読み込み中...</p>
                </CardContent>
              </Card>
            ) : unmappedItems.length > 0 ? (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    BOM未紐付けSKU一覧
                  </CardTitle>
                  <CardDescription>
                    在庫・売上シートに存在するが、BOMに紐づかないSKUです（社内IDの計算対象外）
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="text-sm text-muted-foreground">
                      選択中: <span className="font-semibold text-foreground">{selectedCount}</span>件（最大50件）
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-transparent"
                        onClick={() => setSelectedIds([])}
                        disabled={selectedCount === 0 || pendingId !== null}
                      >
                        選択解除
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={selectedCount === 0 || pendingId !== null}
                          >
                            {pendingId === 'bulk' ? '一括更新中...' : '選択分を取り扱い不可'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>選択したSKUを取り扱い不可にしますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                              選択中 {selectedCount} 件を「取り扱い不可」として登録し、次回ETL以降の「BOM未紐付け監視」から除外します。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={pendingId !== null}>キャンセル</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={pendingId !== null}
                              onClick={(e) => {
                                e.preventDefault();
                                bulkMarkUnavailable().catch((err) => {
                                  const msg = err instanceof Error ? err.message : String(err);
                                  setLastMessage(`一括更新に失敗しました: ${msg}`);
                                });
                              }}
                            >
                              一括で取り扱い不可にする
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[44px]">
                            <Checkbox
                              checked={allVisibleSelected}
                              onCheckedChange={(v) => toggleSelectAllVisible(Boolean(v))}
                              aria-label="表示中を全選択"
                            />
                          </TableHead>
                          <TableHead className="font-semibold">店舗</TableHead>
                          <TableHead className="font-semibold">商品管理番号</TableHead>
                          <TableHead className="font-semibold">SKU番号</TableHead>
                          <TableHead className="text-right font-semibold">在庫</TableHead>
                          <TableHead className="text-right font-semibold">先月売上</TableHead>
                          <TableHead className="text-right font-semibold">今月売上</TableHead>
                          <TableHead className="font-semibold">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sorted.map((x) => (
                          <TableRow
                            key={x.listing_id}
                            className={cn(
                              x.stock_qty > 0 ? 'hover:bg-destructive/5' : 'hover:bg-accent/30'
                            )}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedSet.has(x.listing_id)}
                                onCheckedChange={(v) => toggleSelectOne(x.listing_id, Boolean(v))}
                                aria-label={`選択 ${x.listing_id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {x.store_id}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {x.rakuten_item_no}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {x.rakuten_sku}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {x.stock_qty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {x.last_month_sales.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {x.this_month_sales.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={pendingId !== null}
                                  >
                                    {pendingId === x.listing_id ? '更新中...' : '取り扱い不可'}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>取り扱い不可にしますか？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      このSKUを「取り扱い不可」として登録し、次回ETL以降の「BOM未紐付け監視」から除外します。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={pendingId !== null}>キャンセル</AlertDialogCancel>
                                    <AlertDialogAction
                                      disabled={pendingId !== null}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        markUnavailable(x).catch((err) => {
                                          const msg = err instanceof Error ? err.message : String(err);
                                          setLastMessage(`更新に失敗しました: ${msg}`);
                                        });
                                      }}
                                    >
                                      取り扱い不可にする
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-success">
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="mx-auto h-16 w-16 text-success mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    BOM未紐付けは検出されませんでした
                  </h3>
                  <p className="text-muted-foreground">
                    すべてのSKUがBOM（社内ID）に紐づいています。
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="excluded">
            {excluded.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>除外中（取り扱い不可）</CardTitle>
                  <CardDescription>
                    「取り扱い不可」として登録済みのSKUです。解除すると監視対象に戻ります。
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-semibold">店舗</TableHead>
                          <TableHead className="font-semibold">商品管理番号</TableHead>
                          <TableHead className="font-semibold">SKU番号</TableHead>
                          <TableHead className="font-semibold">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {excluded.map((x) => (
                          <TableRow key={`excluded:${x.listing_id}`}>
                            <TableCell>
                              <Badge variant="outline">{x.store_id || '-'}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{x.rakuten_item_no || '-'}</TableCell>
                            <TableCell className="font-mono text-sm">{x.rakuten_sku || '-'}</TableCell>
                            <TableCell>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="bg-transparent" disabled={pendingId !== null}>
                                    {pendingId === x.listing_id ? '更新中...' : '解除'}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>取り扱い不可を解除しますか？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      解除すると、このSKUは監視対象に戻ります。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={pendingId !== null}>キャンセル</AlertDialogCancel>
                                    <AlertDialogAction
                                      disabled={pendingId !== null}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        unmarkUnavailable(x).catch((err) => {
                                          const msg = err instanceof Error ? err.message : String(err);
                                          setLastMessage(`更新に失敗しました: ${msg}`);
                                        });
                                      }}
                                    >
                                      解除する
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">除外中（取り扱い不可）はありません。</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

