'use client';

import { Navigation } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Package,
  TrendingUp,
  AlertCircle,
  Store,
  ShoppingCart,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';
import { useItemMetrics } from '@/lib/use-view';
import { useCart } from '@/lib/use-cart';

export default function ItemDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const itemMetricsState = useItemMetrics();
  const cart = useCart();
  const items = itemMetricsState.data ?? [];
  const item =
    items.find((i) => i.internal_id === id);

  if (itemMetricsState.status === 'loading' && items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            読み込み中...
          </div>
        </main>
      </div>
    );
  }

  if (itemMetricsState.status === 'error' && items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span>データ取得に失敗しました: {itemMetricsState.error}</span>
              <Button variant="outline" size="sm" onClick={itemMetricsState.refresh} className="bg-transparent">
                再試行
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // success
  if (!item) {
    notFound();
  }

  const getRiskBadge = (level: typeof item.risk_level) => {
    const variants = {
      red: 'bg-destructive text-destructive-foreground',
      yellow: 'bg-warning text-warning-foreground',
      green: 'bg-success text-success-foreground',
      surplus: 'bg-surplus text-surplus-foreground',
      dormant: 'bg-dormant text-dormant-foreground',
    };
    const labels = {
      red: '危険',
      yellow: '警告',
      green: '安全',
      surplus: '余剰',
      dormant: '休眠',
    };
    return (
      <Badge className={cn('font-medium text-base', variants[level])}>
        {labels[level]}
      </Badge>
    );
  };

  const formatDaysOfCover = () => {
    if (item.derived_stock === 0) {
      return '0.0';
    }
    if (item.avg_daily_consumption === 0) {
      return '∞';
    }
    return (item.days_of_cover ?? 0).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/items">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              在庫一覧に戻る
            </Button>
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground text-balance">
                {item.name}
              </h1>
              <p className="mt-2 font-mono text-lg text-muted-foreground">
                {item.internal_id}
              </p>
            </div>
            {getRiskBadge(item.risk_level)}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 在庫状況カード */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                在庫状況
              </CardTitle>
              <CardDescription>現在の在庫数と消費速度</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">
                  在庫数（派生計算）
                </span>
                <span className="text-2xl font-bold text-foreground">
                  {item.derived_stock.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">
                  平均日次消費
                </span>
                <span className="text-xl font-semibold text-foreground">
                  {item.avg_daily_consumption.toFixed(1)} / 日
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">在庫日数</span>
                <span
                  className={cn(
                    'text-xl font-semibold',
                    item.risk_level === 'red' && 'text-destructive',
                    item.risk_level === 'yellow' && 'text-warning',
                    item.risk_level === 'green' && 'text-success',
                    item.risk_level === 'surplus' && 'text-surplus',
                    item.risk_level === 'dormant' && 'text-dormant'
                  )}
                >
                  {formatDaysOfCover()}日
                </span>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    {item.risk_level === 'red' && (
                      <p>
                        <span className="font-semibold text-destructive">
                          危険：
                        </span>
                        在庫日数がリードタイムを下回っています。至急発注してください。
                      </p>
                    )}
                    {item.risk_level === 'yellow' && (
                      <p>
                        <span className="font-semibold text-warning">
                          警告：
                        </span>
                        在庫日数が目標在庫日数を下回っています。発注を検討してください。
                      </p>
                    )}
                    {item.risk_level === 'green' && (
                      <p>
                        <span className="font-semibold text-success">
                          安全：
                        </span>
                        在庫は十分です。発注の必要はありません。
                      </p>
                    )}
                    {item.risk_level === 'surplus' && (
                      <p>
                        <span className="font-semibold text-surplus">
                          余剰：
                        </span>
                        在庫日数が300日以上です。過剰在庫の可能性があります（販促・在庫圧縮等を検討）。
                      </p>
                    )}
                    {item.risk_level === 'dormant' && (
                      <p>
                        <span className="font-semibold text-dormant">
                          休眠：
                        </span>
                        在庫数も消費も0です。取扱停止・未設定・季節商品などの可能性があります。
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 売上（先月/今月）カード */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                売上（先月/今月）
              </CardTitle>
              <CardDescription>社内ID単位の売上個数（BOM展開後）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>チャネル</TableHead>
                      <TableHead className="text-right">先月</TableHead>
                      <TableHead className="text-right">今月</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <Badge variant="outline" className="border-primary text-primary">
                          metro
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{(item.metro_last_month_sales ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{(item.metro_this_month_sales ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge variant="outline" className="border-chart-2 text-chart-2">
                          windy
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{(item.windy_last_month_sales ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{(item.windy_this_month_sales ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge variant="outline">yahoo</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{(item.yahoo_last_month_sales ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{(item.yahoo_this_month_sales ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* 発注推奨カード */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                発注推奨
              </CardTitle>
              <CardDescription>
                自動計算された発注推奨数量
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">
                  発注推奨数量
                </span>
                {item.reorder_qty_suggested > 0 ? (
                  <span className="text-2xl font-bold text-primary">
                    {item.reorder_qty_suggested.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xl font-semibold text-muted-foreground">
                    不要
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">
                  発注ロット
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {item.lot_size.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">
                  仕入れ値（初期）
                </span>
                <span className="text-lg font-semibold text-foreground">
                  ¥{item.default_unit_cost?.toLocaleString() ?? '-'}
                </span>
              </div>
              {item.reorder_qty_suggested > 0 && item.default_unit_cost && (
                <div className="rounded-lg bg-primary/10 p-4">
                  <p className="text-sm text-muted-foreground">
                    推奨発注金額
                  </p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    ¥
                    {(
                      item.reorder_qty_suggested * item.default_unit_cost
                    ).toLocaleString()}
                  </p>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {cart.lines.some((l) => l.internal_id === item.internal_id) ? (
                  <Link href="/po/cart" className="block sm:col-span-2">
                    <Button className="w-full" size="lg">
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      カートへ
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => {
                        const qty =
                          item.reorder_qty_suggested > 0
                            ? item.reorder_qty_suggested
                            : item.lot_size;
                        cart.actions.addToCart({
                          internal_id: item.internal_id,
                          name: item.name,
                          qty,
                          unit_cost: item.default_unit_cost ?? 0,
                          lot_size: item.lot_size,
                          basis_need_qty: item.need_qty,
                          basis_days_of_cover: item.days_of_cover === null ? undefined : item.days_of_cover,
                        });
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      カートに追加
                    </Button>
                    <Link href="/po/cart" className="block">
                      <Button variant="outline" className="w-full bg-transparent" size="lg">
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        カートを見る
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* SKU別 消費（先月/今月） */}
        {item.listings && item.listings.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                SKU別 消費（先月/今月）
              </CardTitle>
              <CardDescription>
                SKUごとの売上個数（先月・今月）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>店舗</TableHead>
                      <TableHead>商品管理番号</TableHead>
                      <TableHead>SKU番号</TableHead>
                      <TableHead>SKU名称</TableHead>
                      <TableHead className="text-right">先月消費</TableHead>
                      <TableHead className="text-right">今月消費</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.listings.map((listing) => (
                      <TableRow key={listing.listing_id}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              listing.store_id === 'metro'
                                ? 'border-primary text-primary'
                                : 'border-chart-2 text-chart-2'
                            )}
                          >
                            {listing.store_id}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {listing.rakuten_item_no}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {listing.rakuten_sku}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate">
                          {listing.title}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {listing.last_month_sales.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {listing.this_month_sales.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Yahoo 商品別 消費（先月/今月） */}
        {item.yahoo_listings && item.yahoo_listings.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Yahoo 商品別 消費（先月/今月）
              </CardTitle>
              <CardDescription>
                Yahooの商品コード×サブコードごとの売上個数（先月・今月）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品コード</TableHead>
                      <TableHead>サブコード</TableHead>
                      <TableHead>商品名</TableHead>
                      <TableHead className="text-right">先月消費</TableHead>
                      <TableHead className="text-right">今月消費</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.yahoo_listings.map((y) => (
                      <TableRow key={y.yahoo_listing_id}>
                        <TableCell className="font-mono text-sm">{y.item_code}</TableCell>
                        <TableCell className="font-mono text-sm">{y.sub_code || '-'}</TableCell>
                        <TableCell className="max-w-[420px] truncate" title={y.name || ''}>
                          {y.name || '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {y.last_month_sales.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {y.this_month_sales.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
