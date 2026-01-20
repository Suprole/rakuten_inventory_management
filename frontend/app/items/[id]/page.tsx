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
  Clock,
  Store,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';
import { useItemMetrics } from '@/lib/use-view';

export default function ItemDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const itemMetricsState = useItemMetrics();
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
    };
    const labels = {
      red: '危険',
      yellow: '警告',
      green: '安全',
    };
    return (
      <Badge className={cn('font-medium text-base', variants[level])}>
        {labels[level]}
      </Badge>
    );
  };

  const formatDaysOfCover = () => {
    if (item.avg_daily_consumption === 0) {
      return '∞';
    }
    return (item.days_of_cover ?? 0).toFixed(1);
  };

  // 紐づくSKUの寄与率を計算
  const totalContributionStock = item.listings?.reduce(
    (sum, l) => sum + l.contribution_stock,
    0
  ) ?? 0;
  const totalContributionConsumption = item.listings?.reduce(
    (sum, l) => sum + l.contribution_consumption,
    0
  ) ?? 0;

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
                    item.risk_level === 'green' && 'text-success'
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
                  </div>
                </div>
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
              {item.reorder_qty_suggested > 0 && (
                <Link href="/po/new" className="block">
                  <Button className="w-full" size="lg">
                    この商品を発注する
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* 発注パラメータカード */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                発注パラメータ
              </CardTitle>
              <CardDescription>
                リードタイムと安全在庫の設定
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  リードタイム
                </span>
                <span className="font-semibold text-foreground">
                  {item.lead_time_days}日
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  安全在庫
                </span>
                <span className="font-semibold text-foreground">
                  {item.safety_stock.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  バッファ日数
                </span>
                <span className="font-semibold text-foreground">14日</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-medium text-muted-foreground">
                  目標在庫日数
                </span>
                <span className="font-bold text-foreground">
                  {item.target_cover_days}日
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 計算詳細カード */}
          <Card>
            <CardHeader>
              <CardTitle>計算詳細</CardTitle>
              <CardDescription>発注推奨数量の計算根拠</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 rounded-lg bg-muted p-4">
                <p className="text-xs text-muted-foreground">計算式</p>
                <p className="font-mono text-sm text-foreground">
                  必要数量 = 日次消費 × 目標日数 + 安全在庫 - 現在庫
                </p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  日次消費 × 目標日数
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {(
                    item.avg_daily_consumption * item.target_cover_days
                  ).toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">+ 安全在庫</span>
                <span className="font-mono font-semibold text-foreground">
                  {item.safety_stock}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">- 現在庫</span>
                <span className="font-mono font-semibold text-foreground">
                  -{item.derived_stock}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">
                  = 必要数量（丸め前）
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {item.need_qty.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="font-medium text-muted-foreground">
                  発注推奨（ロット丸め後）
                </span>
                <span className="font-mono text-lg font-bold text-primary">
                  {item.reorder_qty_suggested.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 紐づくSKU一覧 */}
        {item.listings && item.listings.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                紐づくSKU一覧
              </CardTitle>
              <CardDescription>
                この社内IDに紐づく楽天SKUと、在庫・消費への寄与
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
                      <TableHead className="text-right">SKU在庫</TableHead>
                      <TableHead className="text-right">BOM数量</TableHead>
                      <TableHead className="text-right">
                        在庫寄与
                      </TableHead>
                      <TableHead className="text-right">先月売上</TableHead>
                      <TableHead className="text-right">今月売上</TableHead>
                      <TableHead className="text-right">
                        需要推定（/日）
                      </TableHead>
                      <TableHead className="text-right">
                        消費寄与（/日）
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.listings.map((listing) => {
                      const stockContribPct =
                        totalContributionStock > 0
                          ? (
                              (listing.contribution_stock /
                                totalContributionStock) *
                              100
                            ).toFixed(1)
                          : '0.0';
                      const consContribPct =
                        totalContributionConsumption > 0
                          ? (
                              (listing.contribution_consumption /
                                totalContributionConsumption) *
                              100
                            ).toFixed(1)
                          : '0.0';

                      return (
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
                          <TableCell className="max-w-[200px] truncate">
                            {listing.title}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {listing.stock_qty.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            ×{listing.bom_qty}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-semibold">
                                {listing.contribution_stock.toLocaleString()}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({stockContribPct}%)
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {listing.last_month_sales.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {listing.this_month_sales.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {listing.r_hat.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-semibold">
                                {listing.contribution_consumption.toFixed(1)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({consContribPct}%)
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* 集計サマリー */}
              <div className="mt-4 grid gap-4 rounded-lg bg-muted p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">紐づくSKU数</p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {item.listings.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    在庫合計（派生）
                  </p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {totalContributionStock.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    消費合計（/日）
                  </p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {totalContributionConsumption.toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">計算基準店舗</p>
                  <p className="mt-1 text-xl font-bold text-primary">metro</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* BOM計算の説明 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              在庫・消費の計算方法
            </CardTitle>
            <CardDescription>
              BOM（セット構成）に基づく派生計算の説明
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg bg-muted p-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  在庫数（derived_stock）の計算
                </p>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  derived_stock = Σ( SKU在庫 × BOM数量 )
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  例：SKU-01（在庫25×BOM1=25）+ SKU-02（在庫10×BOM2=20）=
                  合計45
                </p>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium text-foreground">
                  消費速度（avg_daily_consumption）の計算
                </p>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  avg_daily_consumption = Σ( 需要推定 × BOM数量 )
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  例：SKU-01（需要2.1×BOM1=2.1）+ SKU-02（需要0.55×BOM2=1.1）=
                  合計3.2/日
                </p>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium text-foreground">
                  需要推定（r_hat）の計算
                </p>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  r_hat = w×(今月売上/d) + (1-w)×(先月売上/Dprev)
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  w = min(0.7, d/30)、d=今月経過日数、Dprev=先月日数
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">注意：</span>
                在庫計算にはmetro店舗の在庫のみを使用します（ミラー運用のため）。
                windy店舗はミラーずれ検知にのみ使用されます。
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
