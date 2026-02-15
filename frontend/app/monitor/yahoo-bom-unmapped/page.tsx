'use client';

import { useMemo, useState } from 'react';
import { Navigation } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useYahooUnmappedListings } from '@/lib/use-view';

export default function YahooBomUnmappedMonitorPage() {
  const s = useYahooUnmappedListings();
  const items = useMemo(() => s.data ?? [], [s.data]);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => {
      if (String(x.yahoo_listing_id || '').toLowerCase().includes(q)) return true;
      if (String(x.item_code || '').toLowerCase().includes(q)) return true;
      if (String(x.sub_code || '').toLowerCase().includes(q)) return true;
      if (String(x.name || '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [items, query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aSales = (a.last_month_sales || 0) + (a.this_month_sales || 0);
      const bSales = (b.last_month_sales || 0) + (b.this_month_sales || 0);
      if (aSales !== bSales) return bSales - aSales;
      return String(a.yahoo_listing_id).localeCompare(String(b.yahoo_listing_id));
    });
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <AlertCircle className="h-8 w-8" />
            Yahoo BOM未紐付け監視
          </h1>
          <p className="mt-2 text-muted-foreground">
            Yahoo（ストアクリエイターCSV）に売上があるのに、`yahoo_bom` に紐づいていない商品を検知します
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
          <Card className={items.length > 0 ? 'border-destructive' : 'border-success'}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {items.length > 0 ? (
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
              <div className={items.length > 0 ? 'text-3xl font-bold text-destructive' : 'text-3xl font-bold text-success'}>
                {s.status === 'loading' ? '-' : items.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {items.length > 0 ? 'yahoo_bom の整備が必要です' : '未紐付けは検出されませんでした'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">対応方針</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.length > 0 ? (
                <Badge className="bg-destructive text-destructive-foreground text-base">要整備</Badge>
              ) : (
                <Badge className="bg-success text-success-foreground text-base">正常</Badge>
              )}
              <p className="text-xs text-muted-foreground">
                `yahoo_listings` / `yahoo_bom` を整備し、次回ETLで解消を確認してください。
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>検索</CardTitle>
            <CardDescription>商品コード、サブコード、商品名で検索できます</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="商品コード / サブコード / 商品名 ..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                disabled={s.status === 'loading' && items.length === 0}
              />
            </div>
          </CardContent>
        </Card>

        {s.status === 'loading' ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">読み込み中...</p>
            </CardContent>
          </Card>
        ) : sorted.length > 0 ? (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                未紐付け一覧
              </CardTitle>
              <CardDescription>
                売上（注文点数合計）があるのに、`yahoo_bom` が無い商品です
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold">商品コード</TableHead>
                      <TableHead className="font-semibold">サブコード</TableHead>
                      <TableHead className="font-semibold">商品名</TableHead>
                      <TableHead className="text-right font-semibold">先月</TableHead>
                      <TableHead className="text-right font-semibold">今月</TableHead>
                      <TableHead className="text-right font-semibold">合計</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((x) => {
                      const total = (x.last_month_sales || 0) + (x.this_month_sales || 0);
                      return (
                        <TableRow key={x.yahoo_listing_id} className="hover:bg-destructive/5">
                          <TableCell className="font-mono text-sm">{x.item_code || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{x.sub_code || '-'}</TableCell>
                          <TableCell className="max-w-[520px] truncate" title={x.name || ''}>
                            {x.name || '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">{(x.last_month_sales || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{(x.this_month_sales || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{total.toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-success">
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-success mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">未紐付けは検出されませんでした</h3>
              <p className="text-muted-foreground">Yahoo売上がある商品はすべて `yahoo_bom` に紐づいています。</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

