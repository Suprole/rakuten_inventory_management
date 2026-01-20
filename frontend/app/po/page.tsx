'use client';

import { useMemo, useState } from 'react';
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
import { ShoppingCart, Plus, FileText } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { usePoList } from '@/lib/use-po';
import { useRouter } from 'next/navigation';
import { invalidateRemote } from '@/lib/use-remote';

export default function POListPage() {
  const router = useRouter();
  const poListState = usePoList();
  const items = useMemo(() => poListState.data ?? [], [poListState.data]);
  const [deletingPoId, setDeletingPoId] = useState<string | null>(null);

  const getStatusBadge = (status: string) => {
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
      <Badge className={cn('font-medium', variants[status as keyof typeof variants])}>
        {labels[status as keyof typeof labels]}
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

  const counts = useMemo(() => {
    return {
      draft: items.filter((po) => po.status === 'draft').length,
      sent: items.filter((po) => po.status === 'sent').length,
      cancelled: items.filter((po) => po.status === 'cancelled').length,
    };
  }, [items]);

  const handleDelete = async (poId: string) => {
    if (!poId) return;
    const ok = confirm(`発注 ${poId} を削除します。\nこの操作は取り消せません。\n\n本当に削除しますか？`);
    if (!ok) return;
    setDeletingPoId(poId);
    try {
      const res = await fetch('/api/po/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ po_id: poId }),
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
      await poListState.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`削除に失敗しました: ${msg}`);
    } finally {
      setDeletingPoId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
              <ShoppingCart className="h-8 w-8" />
              発注管理
            </h1>
            <p className="mt-2 text-muted-foreground">
              発注の作成・管理・ステータス確認
            </p>
          </div>
          <Link href="/po/new">
            <Button size="lg">
              <Plus className="mr-2 h-4 w-4" />
              新規発注作成
            </Button>
          </Link>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                ドラフト
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {counts.draft}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                送信済み
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {counts.sent}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                キャンセル
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {counts.cancelled}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              発注一覧
            </CardTitle>
            <CardDescription>
              全ての発注オーダーの一覧
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">発注ID</TableHead>
                    <TableHead className="font-semibold">ステータス</TableHead>
                    <TableHead className="font-semibold">作成日時</TableHead>
                    <TableHead className="font-semibold">サプライヤー</TableHead>
                    <TableHead className="text-right font-semibold">
                      品目数
                    </TableHead>
                    <TableHead className="text-right font-semibold">
                      合計数量
                    </TableHead>
                    <TableHead className="font-semibold">備考</TableHead>
                    <TableHead className="text-right font-semibold">削除</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poListState.status === 'loading' && items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        <p className="text-muted-foreground">読み込み中...</p>
                      </TableCell>
                    </TableRow>
                  ) : poListState.status === 'error' && items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        <div className="space-y-2">
                          <p className="text-destructive">読み込みに失敗しました: {poListState.error}</p>
                          <Button variant="outline" size="sm" onClick={poListState.refresh} className="bg-transparent">
                            再試行
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        <p className="text-muted-foreground">
                          発注データがありません
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((po) => (
                      <TableRow
                        key={po.po_id}
                        className="cursor-pointer hover:bg-accent/50"
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/po/${po.po_id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            router.push(`/po/${po.po_id}`);
                          }
                        }}
                      >
                        <TableCell className="font-mono text-sm font-medium">
                          {po.po_id}
                        </TableCell>
                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                        <TableCell className="text-sm">
                          {formatDate(po.created_at)}
                        </TableCell>
                        <TableCell>
                          {po.supplier || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(po.item_count ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(po.total_qty ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {po.note || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={deletingPoId === po.po_id || po.status === 'sent'}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(po.po_id);
                            }}
                          >
                            削除
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
