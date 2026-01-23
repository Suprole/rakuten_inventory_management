'use client';

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

export default function BomUnmappedMonitorPage() {
  const s = useUnmappedListings();
  const items = s.data ?? [];
  const hasAny = items.length > 0;

  const sorted = [...items].sort((a, b) => {
    // 優先度: 在庫あり → 売上あり → 件数
    const aHasStock = a.stock_qty > 0 ? 1 : 0;
    const bHasStock = b.stock_qty > 0 ? 1 : 0;
    if (aHasStock !== bHasStock) return bHasStock - aHasStock;
    const aSales = (a.this_month_sales || 0) + (a.last_month_sales || 0);
    const bSales = (b.this_month_sales || 0) + (b.last_month_sales || 0);
    if (aSales !== bSales) return bSales - aSales;
    return b.stock_qty - a.stock_qty;
  });

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
          <Card className={hasAny ? 'border-destructive' : 'border-success'}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {hasAny ? (
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
              <div className={cn('text-3xl font-bold', hasAny ? 'text-destructive' : 'text-success')}>
                {s.status === 'loading' ? '-' : items.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasAny ? 'BOM未紐付けのSKUが存在します' : 'BOM未紐付けは検出されませんでした'}
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
              {hasAny ? (
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

        {s.status === 'loading' ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">読み込み中...</p>
            </CardContent>
          </Card>
        ) : hasAny ? (
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold">店舗</TableHead>
                      <TableHead className="font-semibold">商品管理番号</TableHead>
                      <TableHead className="font-semibold">SKU番号</TableHead>
                      <TableHead className="text-right font-semibold">在庫</TableHead>
                      <TableHead className="text-right font-semibold">先月売上</TableHead>
                      <TableHead className="text-right font-semibold">今月売上</TableHead>
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
      </main>
    </div>
  );
}

