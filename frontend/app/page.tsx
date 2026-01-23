'use client';

import Link from 'next/link';
import { Navigation } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, ShoppingCart, AlertTriangle, TrendingUp, AlertCircle } from 'lucide-react';
import { useItemMetrics, useMirrorMismatches, useUnmappedListings } from '@/lib/use-view';

export default function HomePage() {
  const itemMetricsState = useItemMetrics();
  const mismatchState = useMirrorMismatches();
  const unmappedState = useUnmappedListings();
  const items = itemMetricsState.data ?? [];
  const mismatches = mismatchState.data ?? [];
  const unmapped = unmappedState.data ?? [];

  const redItems = items.filter((item) => item.risk_level === 'red');
  const yellowItems = items.filter((item) => item.risk_level === 'yellow');
  const greenItems = items.filter((item) => item.risk_level === 'green');
  const reorderSuggested = items.filter((item) => item.reorder_qty_suggested > 0);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground text-balance">
            楽天2店舗ミラー在庫管理システム
          </h1>
          <p className="mt-2 text-muted-foreground">
            Metro & Windy店舗の在庫・需要予測・発注推奨を一元管理
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          <Card className="border-destructive/50 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-destructive" />
                危険レベル（赤）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">
                {itemMetricsState.status === 'loading' ? '-' : redItems.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                在庫日数 {'<'} リードタイム
              </p>
            </CardContent>
          </Card>

          <Card className="border-warning/50 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-warning" />
                警告レベル（黄）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-warning">
                {itemMetricsState.status === 'loading' ? '-' : yellowItems.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                発注検討が必要
              </p>
            </CardContent>
          </Card>

          <Card className="border-success/50 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-success" />
                安全レベル（緑）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">
                {itemMetricsState.status === 'loading' ? '-' : greenItems.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                在庫十分
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/50 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                発注推奨
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {itemMetricsState.status === 'loading' ? '-' : reorderSuggested.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                商品が発注推奨
              </p>
            </CardContent>
          </Card>

          <Card className="border-destructive/50 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-destructive" />
                BOM未紐付け
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">
                {unmappedState.status === 'loading' ? '-' : unmapped.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                計算対象外SKU
              </p>
            </CardContent>
          </Card>
        </div>

        {itemMetricsState.status === 'error' && (
          <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span>在庫データ取得に失敗しました: {itemMetricsState.error}</span>
              <Button variant="outline" size="sm" onClick={itemMetricsState.refresh} className="bg-transparent">
                再試行
              </Button>
            </div>
          </div>
        )}
        {mismatchState.status === 'error' && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span>ミラーずれデータ取得に失敗しました: {mismatchState.error}</span>
              <Button variant="outline" size="sm" onClick={mismatchState.refresh} className="bg-transparent">
                再試行
              </Button>
            </div>
          </div>
        )}
        {unmappedState.status === 'error' && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span>BOM未紐付けデータ取得に失敗しました: {unmappedState.error}</span>
              <Button variant="outline" size="sm" onClick={unmappedState.refresh} className="bg-transparent">
                再試行
              </Button>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                在庫管理
              </CardTitle>
              <CardDescription>
                社内ID単位での在庫状況・需要予測を確認
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  • リスクレベル別の在庫状況を一覧表示
                </p>
                <p className="text-sm text-muted-foreground">
                  • 在庫日数・消費速度のリアルタイム計算
                </p>
                <p className="text-sm text-muted-foreground">
                  • 検索・フィルタ・ソート機能
                </p>
              </div>
              <Link href="/items">
                <Button className="w-full">在庫一覧を見る</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                発注管理
              </CardTitle>
              <CardDescription>
                発注推奨に基づいた発注作成・管理
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  • 自動計算された発注推奨数量
                </p>
                <p className="text-sm text-muted-foreground">
                  • ロット丸め・安全在庫を考慮
                </p>
                <p className="text-sm text-muted-foreground">
                  • 発注ドラフト作成〜送信管理
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/po/new" className="flex-1">
                  <Button variant="default" className="w-full">発注作成</Button>
                </Link>
                <Link href="/po" className="flex-1">
                  <Button variant="outline" className="w-full bg-transparent">発注一覧</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {mismatchState.status === 'success' && mismatches.length > 0 && (
          <Card className="mt-6 border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                ミラーずれ検知
              </CardTitle>
              <CardDescription>
                Metro店舗とWindy店舗の在庫にずれが検出されています
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {mismatches.length}件のSKUで在庫のずれが確認されました。
                至急確認して修正してください。
              </p>
              <Link href="/monitor/mirror">
                <Button variant="destructive">詳細を確認</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {unmappedState.status === 'success' && unmapped.length > 0 && (
          <Card className="mt-3 border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                BOM未紐付け検知
              </CardTitle>
              <CardDescription>
                BOM（セット構成）に紐づかないSKUが存在します（社内IDの計算対象外）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {unmapped.length}件のSKUがBOM未紐付けです。`listings`/`bom` を整備してください。
              </p>
              <Link href="/monitor/bom-unmapped">
                <Button variant="destructive">詳細を確認</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
