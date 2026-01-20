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
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMirrorMismatches } from '@/lib/use-view';

export default function MirrorMonitorPage() {
  const mismatchState = useMirrorMismatches();
  const mismatches = mismatchState.data ?? [];
  const hasMismatches = mismatches.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <AlertTriangle className="h-8 w-8" />
            ミラーずれ監視
          </h1>
          <p className="mt-2 text-muted-foreground">
            Metro店舗とWindy店舗の在庫ずれを検知
          </p>
        </div>

        {mismatchState.status === 'error' && (
          <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span>データ取得に失敗しました: {mismatchState.error}</span>
              <Button variant="outline" size="sm" onClick={mismatchState.refresh} className="bg-transparent">
                再試行
              </Button>
            </div>
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <Card className={hasMismatches ? 'border-destructive' : 'border-success'}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {hasMismatches ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    ずれ検出数
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    ずれ検出数
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${
                  hasMismatches ? 'text-destructive' : 'text-success'
                }`}
              >
                {mismatchState.status === 'loading' ? '-' : mismatches.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasMismatches
                  ? 'SKUで在庫のずれが確認されました'
                  : '在庫は正常に同期されています'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                ミラー運用ステータス
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasMismatches ? (
                <Badge className="bg-destructive text-destructive-foreground text-base">
                  要確認
                </Badge>
              ) : (
                <Badge className="bg-success text-success-foreground text-base">
                  正常
                </Badge>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                最終チェック: （ETL実行後に反映）
              </p>
            </CardContent>
          </Card>
        </div>

        {mismatchState.status === 'loading' ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">読み込み中...</p>
            </CardContent>
          </Card>
        ) : hasMismatches ? (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                在庫ずれ詳細
              </CardTitle>
              <CardDescription>
                以下のSKUでMetro店舗とWindy店舗の在庫にずれが検出されました
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold">
                        商品管理番号
                      </TableHead>
                      <TableHead className="font-semibold">SKU番号</TableHead>
                      <TableHead className="text-right font-semibold">
                        Metro在庫
                      </TableHead>
                      <TableHead className="text-right font-semibold">
                        Windy在庫
                      </TableHead>
                      <TableHead className="text-right font-semibold">
                        差分
                      </TableHead>
                      <TableHead className="font-semibold">対応</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mismatches.map((mismatch) => (
                      <TableRow key={`${mismatch.rakuten_item_no}|${mismatch.rakuten_sku}`} className="hover:bg-destructive/5">
                        <TableCell className="font-mono text-sm">
                          {mismatch.rakuten_item_no}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {mismatch.rakuten_sku}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {mismatch.metro_stock_qty.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {mismatch.windy_stock_qty.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            className={
                              mismatch.diff > 0
                                ? 'bg-warning text-warning-foreground'
                                : 'bg-destructive text-destructive-foreground'
                            }
                          >
                            {mismatch.diff > 0 ? '+' : ''}
                            {mismatch.diff}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-destructive font-medium">
                            至急修正
                          </span>
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
                在庫は正常に同期されています
              </h3>
              <p className="text-muted-foreground">
                Metro店舗とWindy店舗の在庫にずれは検出されませんでした。
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>ミラー運用について</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              本システムでは、Metro店舗とWindy店舗が同一倉庫を利用しており、
              在庫は実質的に共通（ミラー運用）であることを前提としています。
            </p>
            <p>
              在庫計算には<span className="font-semibold text-foreground">Metro店舗の在庫</span>を使用しています。
              Windy店舗の在庫はミラーずれ検知のための監視用です。
            </p>
            <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20">
              <p className="font-semibold text-destructive mb-2">
                ⚠️ ずれが検出された場合の対応
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>楽天RMSで両店舗の在庫を確認</li>
                <li>正しい在庫数に手動で修正</li>
                <li>翌日のETL実行後、ずれが解消されているか確認</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
