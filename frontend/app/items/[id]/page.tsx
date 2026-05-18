'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { useItemHandlingRecords } from '@/lib/use-master';
import { type DisplayRiskLevel } from '@/lib/view-schema';
import { getDisplayRiskLabel, getDisplayRiskTextClass, getEffectiveDisplayRisk } from '@/lib/item-risk';

export default function ItemDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const itemMetricsState = useItemMetrics();
  const handlingState = useItemHandlingRecords();
  const cart = useCart();
  const items = itemMetricsState.data ?? [];
  const item = items.find((i) => i.internal_id === id);
  const handlingRecords = useMemo(() => handlingState.data ?? [], [handlingState.data]);
  const currentHandling = useMemo(() => {
    if (!item) return undefined;
    const record = handlingRecords.find((entry) => entry.internal_id === item.internal_id);
    if (record) return record;
    if (item.handling_status && item.handling_status !== 'normal') {
      return {
        internal_id: item.internal_id,
        handling_status: item.handling_status,
        suppress_until: item.handling_until,
        note: item.handling_note,
        updated_at: undefined,
        updated_by: undefined,
      };
    }
    return undefined;
  }, [handlingRecords, item]);
  const [handlingStatus, setHandlingStatus] = useState<'normal' | 'deferred'>('normal');
  const [suppressUntil, setSuppressUntil] = useState('');
  const [handlingNote, setHandlingNote] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setHandlingStatus(currentHandling?.handling_status === 'deferred' ? 'deferred' : 'normal');
    setSuppressUntil(currentHandling?.suppress_until || '');
    setHandlingNote(currentHandling?.note || '');
  }, [currentHandling]);

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
  const currentItem = item;
  const effectiveDisplayRisk = getEffectiveDisplayRisk(currentItem, currentHandling);

  const getRiskBadge = (level: DisplayRiskLevel) => {
    const variants = {
      red: 'bg-destructive text-destructive-foreground',
      yellow: 'bg-warning text-warning-foreground',
      green: 'bg-success text-success-foreground',
      surplus: 'bg-surplus text-surplus-foreground',
      dormant: 'bg-dormant text-dormant-foreground',
      deferred: 'bg-muted text-muted-foreground',
    };
    const labels = {
      red: '危険',
      yellow: '警告',
      green: '安全',
      surplus: '余剰',
      dormant: '休眠',
      deferred: '非表示',
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

  async function saveHandling(nextStatus: 'normal' | 'deferred') {
    if (!currentItem) return;
    setIsSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      const res = await fetch('/api/master/item-handling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internal_id: currentItem.internal_id,
          handling_status: nextStatus,
          suppress_until: nextStatus === 'deferred' && suppressUntil ? suppressUntil : undefined,
          note: handlingNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || (json && typeof json === 'object' && (json as { ok?: boolean }).ok === false)) {
        const msg =
          json && typeof json === 'object' && 'message' in json && typeof (json as { message?: unknown }).message === 'string'
            ? (json as { message: string }).message
            : '非表示設定の保存に失敗しました';
        throw new Error(msg);
      }
      handlingState.refresh();
      itemMetricsState.refresh();
      setSaveMessage(
        nextStatus === 'deferred'
          ? '非表示設定を保存しました。一覧・ダッシュボードにも順次反映されます。'
          : '非表示設定を解除しました。'
      );
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  }

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
            {getRiskBadge(effectiveDisplayRisk)}
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
                  className={cn('text-xl font-semibold', getDisplayRiskTextClass(effectiveDisplayRisk))}
                >
                  {formatDaysOfCover()}日
                </span>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    {effectiveDisplayRisk === 'deferred' && (
                      <p>
                        <span className="font-semibold text-foreground">非表示:</span>
                        {` 実リスクは${getDisplayRiskLabel(currentItem.risk_level)}です。発注対象から一時的に外しています。`}
                        {currentHandling?.suppress_until ? ` 期限: ${currentHandling.suppress_until}` : ''}
                      </p>
                    )}
                    {effectiveDisplayRisk !== 'deferred' && currentItem.risk_level === 'red' && (
                      <p>
                        <span className="font-semibold text-destructive">
                          危険：
                        </span>
                        在庫日数がリードタイムを下回っています。至急発注してください。
                      </p>
                    )}
                    {effectiveDisplayRisk !== 'deferred' && currentItem.risk_level === 'yellow' && (
                      <p>
                        <span className="font-semibold text-warning">
                          警告：
                        </span>
                        在庫日数が目標在庫日数を下回っています。発注を検討してください。
                      </p>
                    )}
                    {effectiveDisplayRisk !== 'deferred' && currentItem.risk_level === 'green' && (
                      <p>
                        <span className="font-semibold text-success">
                          安全：
                        </span>
                        在庫は十分です。発注の必要はありません。
                      </p>
                    )}
                    {effectiveDisplayRisk !== 'deferred' && currentItem.risk_level === 'surplus' && (
                      <p>
                        <span className="font-semibold text-surplus">
                          余剰：
                        </span>
                        在庫日数が300日以上です。過剰在庫の可能性があります（販促・在庫圧縮等を検討）。
                      </p>
                    )}
                    {effectiveDisplayRisk !== 'deferred' && currentItem.risk_level === 'dormant' && (
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                非表示設定
              </CardTitle>
              <CardDescription>危険・警告の表示を一時的に非表示へ切り替えます</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">現在の表示</span>
                <div className="flex items-center gap-2">
                  {getRiskBadge(effectiveDisplayRisk)}
                  {effectiveDisplayRisk === 'deferred' && (
                    <span className="text-xs text-muted-foreground">実リスク: {getDisplayRiskLabel(currentItem.risk_level)}</span>
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Button
                  variant={handlingStatus === 'deferred' ? 'default' : 'outline'}
                  className={cn('w-full', handlingStatus === 'deferred' && 'bg-primary text-primary-foreground')}
                  onClick={() => setHandlingStatus('deferred')}
                  disabled={isSaving}
                >
                  非表示にする
                </Button>
                <Button
                  variant={handlingStatus === 'normal' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => setHandlingStatus('normal')}
                  disabled={isSaving}
                >
                  非表示解除
                </Button>
              </div>
              <div className="space-y-2">
                <label htmlFor="handling-until" className="text-sm font-medium text-foreground">
                  非表示期限
                </label>
                <Input
                  id="handling-until"
                  type="date"
                  value={suppressUntil}
                  onChange={(e) => setSuppressUntil(e.target.value)}
                  disabled={isSaving || handlingStatus !== 'deferred'}
                />
                <p className="text-xs text-muted-foreground">未入力なら解除まで非表示扱いを継続します。</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="handling-note" className="text-sm font-medium text-foreground">
                  理由メモ
                </label>
                <Textarea
                  id="handling-note"
                  value={handlingNote}
                  onChange={(e) => setHandlingNote(e.target.value)}
                  placeholder="例: 季節商品のため今月は補充しない"
                  className="min-h-24"
                  disabled={isSaving}
                />
              </div>
              {currentHandling?.updated_at && (
                <div className="text-xs text-muted-foreground">
                  最終更新: {currentHandling.updated_at}
                  {currentHandling.updated_by ? ` / ${currentHandling.updated_by}` : ''}
                </div>
              )}
              {saveMessage && (
                <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
                  {saveMessage}
                </div>
              )}
              {saveError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {saveError}
                </div>
              )}
              {handlingState.status === 'error' && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  非表示設定の読込に失敗しました: {handlingState.error}
                </div>
              )}
              <Button className="w-full" onClick={() => saveHandling(handlingStatus)} disabled={isSaving}>
                {isSaving ? '保存中...' : '非表示設定を保存'}
              </Button>
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
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">
                  仕入先コード
                </span>
                <span className="font-mono text-lg font-semibold text-foreground">
                  {item.supplier_code || '-'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">
                  仕入先名
                </span>
                <span className="text-right text-lg font-semibold text-foreground">
                  {item.supplier_name || '-'}
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
                        cart.actions.addToCart({
                          internal_id: item.internal_id,
                          name: item.name,
                          supplier_code: item.supplier_code,
                          supplier_name: item.supplier_name,
                          qty: 0,
                          unit_cost: item.default_unit_cost ?? 0,
                          recommended_qty: item.reorder_qty_suggested,
                          order_pack: item.order_pack,
                          order_unit: item.order_unit,
                          order_amount: item.order_amount,
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
