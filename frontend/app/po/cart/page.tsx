'use client';

import { useMemo, useState } from 'react';
import { Navigation } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '@/lib/use-cart';
import { invalidateRemote } from '@/lib/use-remote';
import { confirmPo } from '@/lib/po-client';
import { useItemMetrics } from '@/lib/use-view';
import type { ItemMetric } from '@/lib/view-schema';

function formatYen(n: number) {
  const x = Number(n || 0);
  return `¥${Math.round(x).toLocaleString()}`;
}

export default function POCartPage() {
  const router = useRouter();
  const cart = useCart();
  const itemMetricsState = useItemMetrics();
  const itemMetrics: ItemMetric[] = useMemo(() => {
    return itemMetricsState.status === 'success' ? itemMetricsState.data : [];
  }, [itemMetricsState]);

  const itemById = useMemo(() => {
    const m = new Map<string, ItemMetric>();
    for (const it of itemMetrics) m.set(it.internal_id, it);
    return m;
  }, [itemMetrics]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const unresolved = useMemo(() => {
    // item_metrics 側に存在しないIDを検知（ETL更新やマスタ変更の可能性）
    const out: string[] = [];
    for (const l of cart.lines) {
      if (!itemById.has(l.internal_id)) out.push(l.internal_id);
    }
    return out;
  }, [cart.lines, itemById]);

  const canSubmit = cart.lineCount > 0 && !isSubmitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const payload = {
        supplier: cart.cart.supplier,
        note: cart.cart.note,
        lines: cart.lines.map((l) => ({
          internal_id: l.internal_id,
          qty: l.qty,
          unit_cost: l.unit_cost,
          basis_need_qty: l.basis_need_qty,
          basis_days_of_cover: l.basis_days_of_cover,
        })),
      };

      const res = await confirmPo(payload);

      // 成功（sent）
      if (res && typeof res === 'object' && 'ok' in res && (res as any).ok === true) {
        const poId = (res as any).po_id as string;
        cart.actions.clearCart();
        invalidateRemote('po:list');
        invalidateRemote(`po:detail:${poId}`);
        alert('発注を確定しました（送信済み）');
        router.push(`/po/${poId}`);
        return;
      }

      // メール失敗（draft維持だがpo_idは返す）
      if (res && typeof res === 'object' && 'error' in res && (res as any).error === 'mail_failed') {
        const poId = (res as any).po_id as string | undefined;
        const msg = (res as any).message as string | undefined;
        if (poId) {
          cart.actions.clearCart();
          invalidateRemote('po:list');
          invalidateRemote(`po:detail:${poId}`);
          alert(`発注ドラフトは作成しましたが、メール送信に失敗しました: ${msg || 'unknown'}`);
          router.push(`/po/${poId}`);
          return;
        }
      }

      const errMsg =
        res && typeof res === 'object' && 'message' in res && typeof (res as any).message === 'string'
          ? ((res as any).message as string)
          : res && typeof res === 'object' && 'error' in res && typeof (res as any).error === 'string'
            ? ((res as any).error as string)
            : 'unknown_error';
      throw new Error(errMsg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`発注確定に失敗しました: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
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
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <ShoppingCart className="h-8 w-8" />
            発注カート
          </h1>
          <p className="mt-2 text-muted-foreground">
            一覧から追加した商品を編集し、確定すると発注作成とメール送信を行います
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {unresolved.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                item_metrics に存在しない商品があります（ETL更新/マスタ変更の可能性）: {unresolved.join(', ')}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>カート内容</span>
                  {cart.lineCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('カートを空にしますか？')) cart.actions.clearCart();
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      クリア
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  数量はロット単位に自動丸めされます（ロット変更時も再丸め）
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-semibold">社内ID</TableHead>
                        <TableHead className="font-semibold">商品名</TableHead>
                        <TableHead className="text-right font-semibold">ロット</TableHead>
                        <TableHead className="text-right font-semibold">発注数量</TableHead>
                        <TableHead className="text-right font-semibold">単価</TableHead>
                        <TableHead className="text-right font-semibold">金額</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.lineCount === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center">
                            <p className="text-muted-foreground">カートが空です</p>
                            <Link href="/items" className="inline-block mt-2">
                              <Button variant="outline" className="bg-transparent">
                                在庫一覧へ
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ) : (
                        cart.lines.map((line) => {
                          const latest = itemById.get(line.internal_id);
                          const name = latest?.name || line.name || line.internal_id;
                          return (
                            <TableRow key={line.internal_id}>
                              <TableCell className="font-mono text-sm">
                                <Link href={`/items/${encodeURIComponent(line.internal_id)}`} className="text-primary hover:underline">
                                  {line.internal_id}
                                </Link>
                              </TableCell>
                              <TableCell className="font-medium max-w-[260px] truncate">
                                {name}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  className="w-24 text-right"
                                  min={1}
                                  step={1}
                                  value={line.lot_size}
                                  onChange={(e) => {
                                    cart.actions.updateLine(line.internal_id, {
                                      lot_size: parseInt(e.target.value) || 1,
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  className="w-24 text-right"
                                  min={0}
                                  step={line.lot_size}
                                  value={line.qty}
                                  onChange={(e) => {
                                    cart.actions.updateLine(line.internal_id, {
                                      qty: parseInt(e.target.value) || 0,
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  className="w-24 text-right"
                                  min={0}
                                  step={1}
                                  value={line.unit_cost}
                                  onChange={(e) => {
                                    cart.actions.updateLine(line.internal_id, {
                                      unit_cost: parseFloat(e.target.value) || 0,
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                {formatYen(line.qty * line.unit_cost)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-transparent text-destructive hover:text-destructive"
                                  onClick={() => cart.actions.removeLine(line.internal_id)}
                                >
                                  削除
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>発注情報</CardTitle>
                <CardDescription>サプライヤーと備考を入力</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier">サプライヤー</Label>
                  <Input
                    id="supplier"
                    value={cart.cart.supplier}
                    placeholder="例: サプライヤーA"
                    onChange={(e) => cart.actions.setCartMeta({ supplier: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note">備考</Label>
                  <Textarea
                    id="note"
                    value={cart.cart.note}
                    placeholder="発注に関するメモを入力..."
                    rows={4}
                    onChange={(e) => cart.actions.setCartMeta({ note: e.target.value })}
                  />
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">選択品目数</span>
                    <span className="font-semibold text-foreground">{cart.lineCount} 件</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">合計数量</span>
                    <span className="font-mono font-semibold text-foreground">
                      {cart.totalQty.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="font-medium text-muted-foreground">合計金額</span>
                    <span className="text-xl font-bold text-primary">
                      {formatYen(cart.totalAmount)}
                    </span>
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="w-full" size="lg" disabled={!canSubmit}>
                      {isSubmitting ? '確定中...' : '発注を確定'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>発注を確定しますか？</AlertDialogTitle>
                      <AlertDialogDescription>
                        この操作で発注を作成し、メール送信を行います。メール送信に失敗した場合はドラフトのまま保存されます。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">品目数</span>
                        <span className="font-semibold">{cart.lineCount} 件</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">合計数量</span>
                        <span className="font-mono font-semibold">{cart.totalQty.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2">
                        <span className="text-muted-foreground">合計金額</span>
                        <span className="font-semibold">{formatYen(cart.totalAmount)}</span>
                      </div>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isSubmitting}>戻る</AlertDialogCancel>
                      <AlertDialogAction disabled={isSubmitting} onClick={handleConfirm}>
                        確定する
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <p className="text-xs text-center text-muted-foreground">
                  確定後は発注詳細から内容を確認できます
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

