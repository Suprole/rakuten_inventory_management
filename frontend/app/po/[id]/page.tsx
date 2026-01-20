'use client';

import { useEffect, useMemo, useState } from 'react';
import { Navigation } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, FileText, Send, Trash2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useItemMetrics } from '@/lib/use-view';
import type { ItemMetric } from '@/lib/view-schema';
import { invalidateRemote } from '@/lib/use-remote';
import { updatePoStatus } from '@/lib/po-client';
import { usePoDetail } from '@/lib/use-po';

export default function PODetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [status, setStatus] = useState<string>('draft');
  const itemMetricsState = useItemMetrics();
  const [isDeleting, setIsDeleting] = useState(false);

  const detailState = usePoDetail(id);

  const header =
    detailState.data && detailState.data.ok ? detailState.data.header : null;
  const lines =
    detailState.data && detailState.data.ok ? detailState.data.lines : [];

  // 初回にstatusを合わせる（ユーザー操作での即時反映もあるので stateを持つ）
  useEffect(() => {
    if (!header?.status) return;
    // まだユーザー操作で変えていない場合のみ追従（初期はdraft）
    if (status === 'draft' && header.status !== 'draft') {
      setStatus(header.status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header?.status]);

  if (detailState.status !== 'loading' && detailState.data && detailState.data.ok === false && detailState.data.error === 'not_found') {
    notFound();
  }

  const getStatusBadge = (s: string) => {
    const variants = {
      draft: 'bg-muted text-muted-foreground',
      sent: 'bg-success text-success-foreground',
      cancelled: 'bg-destructive text-destructive-foreground',
    };
    const labels = {
      draft: 'ドラフト',
      sent: '送信済み',
      cancelled: 'キャンセル',
    };
    return (
      <Badge className={cn('font-medium text-base', variants[s as keyof typeof variants])}>
        {labels[s as keyof typeof labels]}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getTotalQty = () => {
    return lines.reduce((sum, line) => sum + line.qty, 0);
  };

  const getTotalAmount = () => {
    return lines.reduce((sum, line) => sum + line.qty * (line.unit_cost || 0), 0);
  };

  const handleSend = async () => {
    const result = await updatePoStatus({ po_id: id, status: 'sent' });
    if (!result.ok) {
      alert(`送信に失敗しました: ${'message' in result ? result.message : result.error}`);
      return;
    }
    setStatus('sent');
    alert('発注を送信しました');
    invalidateRemote('po:list');
    invalidateRemote(`po:detail:${id}`);
    detailState.refresh();
  };

  const handleCancel = async () => {
    const result = await updatePoStatus({ po_id: id, status: 'cancelled' });
    if (!result.ok) {
      alert(`キャンセルに失敗しました: ${'message' in result ? result.message : result.error}`);
      return;
    }
    setStatus('cancelled');
    alert('発注をキャンセルしました');
    invalidateRemote('po:list');
    invalidateRemote(`po:detail:${id}`);
    detailState.refresh();
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch('/api/po/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ po_id: id }),
      });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as unknown) : ({} as unknown);
      const obj = (json && typeof json === 'object' ? (json as Record<string, unknown>) : null);
      const okVal = obj && typeof obj.ok === 'boolean' ? obj.ok : undefined;
      if (!res.ok || okVal === false) {
        const errVal = obj && typeof obj.error === 'string' ? obj.error : undefined;
        const msgVal = obj && typeof obj.message === 'string' ? obj.message : undefined;
        throw new Error(msgVal || errVal || `http_${res.status}`);
      }
      invalidateRemote('po:list');
      invalidateRemote(`po:detail:${id}`);
      alert('発注を削除しました');
      router.push('/po');
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`削除に失敗しました: ${msg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const getItemName = (internalId: string) => {
    return internalId;
  };

  const itemNameById = useMemo(() => {
    if (itemMetricsState.status !== 'success') return new Map<string, string>();
    const map = new Map<string, string>();
    for (const it of itemMetricsState.data as ItemMetric[]) {
      map.set(it.internal_id, it.name);
    }
    return map;
  }, [itemMetricsState]);

  const getItemName2 = (internalId: string) => itemNameById.get(internalId) || getItemName(internalId);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {detailState.status === 'loading' && !detailState.data ? (
          <p className="text-muted-foreground">読み込み中...</p>
        ) : detailState.status === 'error' && !detailState.data ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span>読み込みに失敗しました: {detailState.error}</span>
              <Button variant="outline" size="sm" onClick={detailState.refresh} className="bg-transparent">
                再試行
              </Button>
            </div>
          </div>
        ) : detailState.status === 'error' ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center justify-between gap-3">
              <span>再取得に失敗しました（最後の成功データを表示中）: {detailState.error}</span>
              <Button variant="outline" size="sm" onClick={detailState.refresh} className="bg-transparent">
                再試行
              </Button>
            </div>
          </div>
        ) : null}
        <div className="mb-6">
          <Link href="/po">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              発注一覧に戻る
            </Button>
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {header?.po_id || id}
              </h1>
              {header?.created_at && (
                <p className="mt-2 text-muted-foreground">
                  作成日時: {formatDate(header.created_at)}
                </p>
              )}
            </div>
            {getStatusBadge(status)}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  発注明細
                </CardTitle>
                <CardDescription>
                  {lines.length}品目、合計{getTotalQty().toLocaleString()}個
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-semibold">No.</TableHead>
                        <TableHead className="font-semibold">社内ID</TableHead>
                        <TableHead className="font-semibold">商品名</TableHead>
                        <TableHead className="text-right font-semibold">
                          数量
                        </TableHead>
                        <TableHead className="text-right font-semibold">
                          単価
                        </TableHead>
                        <TableHead className="text-right font-semibold">
                          金額
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow key={line.line_no}>
                          <TableCell className="font-mono text-sm">
                            {line.line_no}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {line.internal_id}
                          </TableCell>
                          <TableCell className="font-medium">
                            {getItemName2(line.internal_id)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {line.qty.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            ¥{line.unit_cost?.toLocaleString() || '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            ¥
                            {(
                              line.qty * (line.unit_cost || 0)
                            ).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={3} className="font-semibold">
                          合計
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {getTotalQty().toLocaleString()}
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right font-mono text-lg font-bold text-primary">
                          ¥{getTotalAmount().toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {lines.some((line) => line.basis_need_qty || line.basis_days_of_cover) && (
              <Card>
                <CardHeader>
                  <CardTitle>発注根拠</CardTitle>
                  <CardDescription>
                    推奨数量の計算根拠
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-semibold">商品名</TableHead>
                          <TableHead className="text-right font-semibold">
                            必要数（丸め前）
                          </TableHead>
                          <TableHead className="text-right font-semibold">
                            在庫日数
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line) => (
                          <TableRow key={line.line_no}>
                            <TableCell className="font-medium">
                              {getItemName2(line.internal_id)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {line.basis_need_qty?.toFixed(1) || '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-destructive">
                              {line.basis_days_of_cover?.toFixed(1) || '-'}日
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>発注情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">発注ID</p>
                  <p className="font-mono font-semibold text-foreground">
                    {header?.po_id || id}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">ステータス</p>
                  {getStatusBadge(status)}
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">作成日時</p>
                  <p className="text-sm font-semibold text-foreground">
                    {header?.created_at ? formatDate(header.created_at) : '-'}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">サプライヤー</p>
                  <p className="font-semibold text-foreground">
                    {header?.supplier || '-'}
                  </p>
                </div>
                {header?.note && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">備考</p>
                    <p className="text-sm text-foreground">{header.note}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>集計</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">品目数</span>
                  <span className="font-semibold text-foreground">
                    {lines.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">合計数量</span>
                  <span className="font-mono font-semibold text-foreground">
                    {getTotalQty().toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="font-medium text-muted-foreground">
                    合計金額
                  </span>
                  <span className="text-xl font-bold text-primary">
                    ¥{getTotalAmount().toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            {status === 'draft' && (
              <Card>
                <CardHeader>
                  <CardTitle>操作</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button className="w-full" size="lg">
                        <Send className="mr-2 h-4 w-4" />
                        発注を送信
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>発注を送信しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                          この操作を実行すると、発注が送信済みになります。
                          送信後はキャンセルできません。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSend}>
                          送信する
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full bg-transparent" size="lg">
                        <XCircle className="mr-2 h-4 w-4" />
                        キャンセル
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>発注をキャンセルしますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                          この操作を実行すると、発注がキャンセル済みになります。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>戻る</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleCancel}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          キャンセルする
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full bg-transparent text-destructive hover:text-destructive"
                        size="lg"
                        disabled={isDeleting}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        削除
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>発注を削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                          この操作は取り消せません。発注（{header?.po_id || id}）を完全に削除します。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>戻る</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          削除する
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
