'use client';

import { useMemo, useState } from 'react';
import { Navigation } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  ShoppingCart,
  Plus,
  Package,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useItemMetrics } from '@/lib/use-view';
import type { ItemMetric } from '@/lib/view-schema';
import { invalidateRemote } from '@/lib/use-remote';
import { createPo } from '@/lib/po-client';

interface POItem {
  internal_id: string;
  name: string;
  qty: number;
  unit_cost: number;
  risk_level: 'red' | 'yellow' | 'green';
  derived_stock: number;
  avg_daily_consumption: number;
  lot_size: number;
}

type RiskFilter = 'all' | 'red' | 'yellow' | 'green';
type BrowseMode = 'search' | 'all';
type DisplayMode = 'flat' | 'grouped';

const PAGE_SIZE = 10;

export default function PONewPage() {
  const router = useRouter();
  const itemMetricsState = useItemMetrics();
  const itemMetrics: ItemMetric[] = useMemo(() => {
    return itemMetricsState.status === 'success' ? itemMetricsState.data : [];
  }, [itemMetricsState]);
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [poItems, setPOItems] = useState<Record<string, POItem>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('search');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('flat');
  const [page, setPage] = useState(1);
  const [pageByRisk, setPageByRisk] = useState<Record<'red' | 'yellow' | 'green', number>>({
    red: 1,
    yellow: 1,
    green: 1,
  });

  const candidateItems = useMemo(() => {
    const base =
      browseMode === 'all'
        ? itemMetrics
        : searchQuery.trim()
          ? itemMetrics.filter((item) => {
              const q = searchQuery.toLowerCase();
              return (
                item.internal_id.toLowerCase().includes(q) ||
                item.name.toLowerCase().includes(q)
              );
            })
          : [];
    const filtered =
      riskFilter === 'all' ? base : base.filter((i) => i.risk_level === riskFilter);
    return filtered;
  }, [browseMode, itemMetrics, riskFilter, searchQuery]);

  const resetPagination = () => {
    setPage(1);
    setPageByRisk({ red: 1, yellow: 1, green: 1 });
  };

  const formatDays = (v: number | null | undefined) => {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    return `${v.toFixed(1)}日`;
  };

  const handleAddItem = (internalId: string, customQty?: number) => {
    if (selectedItems.has(internalId)) return;
    
    const item = itemMetrics.find((i) => i.internal_id === internalId);
    if (!item) return;

    const newSelected = new Set(selectedItems);
    newSelected.add(internalId);
    setSelectedItems(newSelected);

    // 数量: 推奨がある場合はその値、ない場合はロットサイズ（最小発注単位）
    const qty = customQty ?? (item.reorder_qty_suggested > 0 ? item.reorder_qty_suggested : item.lot_size);

    setPOItems({
      ...poItems,
      [internalId]: {
        internal_id: item.internal_id,
        name: item.name,
        qty: qty,
        unit_cost: item.default_unit_cost || 0,
        risk_level: item.risk_level,
        derived_stock: item.derived_stock,
        avg_daily_consumption: item.avg_daily_consumption,
        lot_size: item.lot_size,
      },
    });
  };

  const handleRemoveItem = (internalId: string) => {
    const newSelected = new Set(selectedItems);
    newSelected.delete(internalId);
    setSelectedItems(newSelected);

    const newPOItems = { ...poItems };
    delete newPOItems[internalId];
    setPOItems(newPOItems);
  };

  const handleUpdateQty = (internalId: string, qty: number) => {
    const item = poItems[internalId];
    if (!item) return;
    // ロット単位に丸め
    const roundedQty = Math.ceil(Math.max(0, qty) / item.lot_size) * item.lot_size;
    setPOItems({
      ...poItems,
      [internalId]: {
        ...item,
        qty: roundedQty,
      },
    });
  };

  const handleUpdateUnitCost = (internalId: string, cost: number) => {
    setPOItems({
      ...poItems,
      [internalId]: {
        ...poItems[internalId],
        unit_cost: Math.max(0, cost),
      },
    });
  };

  const getTotalAmount = () => {
    return Object.values(poItems).reduce(
      (sum, item) => sum + item.qty * item.unit_cost,
      0
    );
  };

  const getTotalQty = () => {
    return Object.values(poItems).reduce((sum, item) => sum + item.qty, 0);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const payload = {
      supplier,
      note,
      lines: Object.values(poItems).map((item) => ({
        internal_id: item.internal_id,
        qty: item.qty,
        unit_cost: item.unit_cost,
      })),
    };
    try {
      const poId = await createPo(payload);
      invalidateRemote('po:list');
      setIsSubmitting(false);
      setShowConfirmDialog(false);
      router.push(`/po/${poId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`発注ドラフトの作成に失敗しました: ${msg}`);
      setIsSubmitting(false);
    }
  };

  const getRiskBadge = (risk: 'red' | 'yellow' | 'green') => {
    switch (risk) {
      case 'red':
        return (
          <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/30">
            緊急
          </Badge>
        );
      case 'yellow':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30">
            警告
          </Badge>
        );
      case 'green':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">
            安全
          </Badge>
        );
    }
  };

  const groupedByRisk = useMemo(() => {
    const buckets: Record<'red' | 'yellow' | 'green', ItemMetric[]> = {
      red: [],
      yellow: [],
      green: [],
    };
    for (const it of candidateItems) {
      buckets[it.risk_level].push(it);
    }
    return buckets;
  }, [candidateItems]);

  const totalPages = Math.max(1, Math.ceil(candidateItems.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return candidateItems.slice(start, start + PAGE_SIZE);
  }, [candidateItems, safePage]);

  const renderPager = (p: number, total: number, onChange: (next: number) => void, totalItems: number) => {
    if (totalItems <= PAGE_SIZE) return null;
    const start = (p - 1) * PAGE_SIZE + 1;
    const end = Math.min(p * PAGE_SIZE, totalItems);
    return (
      <div className="flex items-center justify-between gap-3 px-2 pt-3 text-sm text-muted-foreground">
        <span>
          {start}-{end} / {totalItems}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent"
            disabled={p <= 1}
            onClick={() => onChange(p - 1)}
          >
            前へ
          </Button>
          <span className="text-xs">
            {p}/{total}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent"
            disabled={p >= total}
            onClick={() => onChange(p + 1)}
          >
            次へ
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/po">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              発注管理に戻る
            </Button>
          </Link>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <ShoppingCart className="h-8 w-8" />
            新規発注作成
          </h1>
          <p className="mt-2 text-muted-foreground">
            検索から任意の商品を追加し、数量・単価を調整してドラフトを作成します
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* 商品選択（検索から追加） */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  発注商品を追加
                </CardTitle>
                <CardDescription className="mt-1">
                  検索から商品を追加します。必要に応じてリスク別の絞り込み・表示切替ができます。
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="社内ID または 商品名で検索..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          resetPagination();
                        }}
                        className="pl-10"
                        disabled={browseMode === 'all'}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Checkbox
                        checked={browseMode === 'all'}
                        onCheckedChange={(v) => {
                          setBrowseMode(v ? 'all' : 'search');
                          resetPagination();
                        }}
                        id="browse-all"
                      />
                      <Label htmlFor="browse-all" className="text-sm text-muted-foreground cursor-pointer">
                        全件を表示（検索なしでブラウズ）
                      </Label>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <div>
                      <Label className="text-sm">リスク</Label>
                      <Select
                        value={riskFilter}
                        onValueChange={(v) => {
                          setRiskFilter(v as RiskFilter);
                          resetPagination();
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="リスク" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">すべて</SelectItem>
                          <SelectItem value="red">緊急（赤）</SelectItem>
                          <SelectItem value="yellow">警告（黄）</SelectItem>
                          <SelectItem value="green">安全（緑）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">表示</Label>
                      <Select
                        value={displayMode}
                        onValueChange={(v) => {
                          setDisplayMode(v as DisplayMode);
                          resetPagination();
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="表示" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flat">一覧</SelectItem>
                          <SelectItem value="grouped">リスク別</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {browseMode === 'search' && searchQuery.trim() === '' ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Search className="h-10 w-10 mb-3 opacity-50" />
                    <p>社内IDまたは商品名を入力して検索</p>
                    <p className="text-sm mt-1">または「全件を表示」をONにしてブラウズできます</p>
                  </div>
                ) : candidateItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <p>条件に一致する商品が見つかりません</p>
                  </div>
                ) : displayMode === 'grouped' ? (
                  <div className="space-y-4">
                    {(['red', 'yellow', 'green'] as const).map((risk) => {
                      const list = groupedByRisk[risk];
                      if (riskFilter !== 'all' && riskFilter !== risk) return null;
                      const tp = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
                      const cp = Math.min(Math.max(1, pageByRisk[risk] || 1), tp);
                      const start = (cp - 1) * PAGE_SIZE;
                      const pageList = list.slice(start, start + PAGE_SIZE);
                      return (
                        <Card key={risk} className="border-border">
                          <CardHeader className="py-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              {getRiskBadge(risk)}
                              <span className="text-sm text-muted-foreground">{list.length}件</span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-0">
                            {list.length === 0 ? (
                              <div className="px-6 py-4 text-sm text-muted-foreground">該当なし</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="font-semibold">社内ID</TableHead>
                                      <TableHead className="font-semibold">商品名</TableHead>
                                      <TableHead className="text-right font-semibold">現在庫</TableHead>
                                      <TableHead className="text-right font-semibold">在庫日数</TableHead>
                                      <TableHead className="text-right font-semibold">推奨数量</TableHead>
                                      <TableHead className="w-24"></TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {pageList.map((item) => (
                                      <TableRow
                                        key={item.internal_id}
                                        className={cn(selectedItems.has(item.internal_id) && 'bg-primary/5')}
                                      >
                                        <TableCell className="font-mono text-sm">
                                          <Link href={`/items/${item.internal_id}`} className="text-primary hover:underline">
                                            {item.internal_id}
                                          </Link>
                                        </TableCell>
                                        <TableCell className="font-medium max-w-[260px] truncate">
                                          {item.name}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                          {item.derived_stock.toLocaleString()}
                                        </TableCell>
                                        <TableCell
                                          className={cn(
                                            'text-right font-mono text-sm',
                                            item.risk_level === 'red' && 'text-destructive',
                                            item.risk_level === 'yellow' && 'text-warning'
                                          )}
                                        >
                                          {formatDays(item.days_of_cover)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                          {item.reorder_qty_suggested > 0 ? (
                                            <span className="text-primary font-semibold">
                                              {item.reorder_qty_suggested.toLocaleString()}
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">-</span>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {selectedItems.has(item.internal_id) ? (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleRemoveItem(item.internal_id)}
                                              className="text-destructive hover:text-destructive"
                                            >
                                              <X className="h-4 w-4 mr-1" />
                                              削除
                                            </Button>
                                          ) : (
                                            <Button variant="outline" size="sm" onClick={() => handleAddItem(item.internal_id)}>
                                              <Plus className="h-4 w-4 mr-1" />
                                              追加
                                            </Button>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                {renderPager(cp, tp, (next) => setPageByRisk((prev) => ({ ...prev, [risk]: next })), list.length)}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-semibold">社内ID</TableHead>
                          <TableHead className="font-semibold">商品名</TableHead>
                          <TableHead className="font-semibold">リスク</TableHead>
                          <TableHead className="text-right font-semibold">現在庫</TableHead>
                          <TableHead className="text-right font-semibold">在庫日数</TableHead>
                          <TableHead className="text-right font-semibold">推奨数量</TableHead>
                          <TableHead className="w-24"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedItems.map((item) => (
                          <TableRow
                            key={item.internal_id}
                            className={cn(selectedItems.has(item.internal_id) && 'bg-primary/5')}
                          >
                            <TableCell className="font-mono text-sm">
                              <Link href={`/items/${item.internal_id}`} className="text-primary hover:underline">
                                {item.internal_id}
                              </Link>
                            </TableCell>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {item.name}
                            </TableCell>
                            <TableCell>{getRiskBadge(item.risk_level)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.derived_stock.toLocaleString()}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-mono text-sm',
                                item.risk_level === 'red' && 'text-destructive',
                                item.risk_level === 'yellow' && 'text-warning'
                              )}
                            >
                              {formatDays(item.days_of_cover)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.reorder_qty_suggested > 0 ? (
                                <span className="text-primary font-semibold">
                                  {item.reorder_qty_suggested.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {selectedItems.has(item.internal_id) ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveItem(item.internal_id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  削除
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" onClick={() => handleAddItem(item.internal_id)}>
                                  <Plus className="h-4 w-4 mr-1" />
                                  追加
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-sm text-muted-foreground mt-2 px-2">
                      {candidateItems.length}件の商品が見つかりました
                    </p>
                    {renderPager(safePage, totalPages, setPage, candidateItems.length)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 発注明細編集 */}
            {selectedItems.size > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    発注明細 ({selectedItems.size}件)
                  </CardTitle>
                  <CardDescription>
                    数量と単価を調整してください（数量はロット単位に自動丸め）
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-semibold">商品</TableHead>
                          <TableHead className="text-right font-semibold">
                            推奨数量
                          </TableHead>
                          <TableHead className="text-right font-semibold">
                            ロット
                          </TableHead>
                          <TableHead className="text-right font-semibold">
                            発注数量
                          </TableHead>
                          <TableHead className="text-right font-semibold">
                            単価
                          </TableHead>
                          <TableHead className="text-right font-semibold">
                            金額
                          </TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from(selectedItems).map((internalId) => {
                          const poItem = poItems[internalId];
                          if (!poItem) return null;
                          const originalItem = itemMetrics.find(
                            (i) => i.internal_id === internalId
                          );
                          return (
                            <TableRow key={internalId}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{poItem.name}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-muted-foreground font-mono">
                                      {internalId}
                                    </span>
                                    {getRiskBadge(poItem.risk_level)}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {originalItem && originalItem.reorder_qty_suggested > 0 ? (
                                  <span className="text-primary">
                                    {originalItem.reorder_qty_suggested.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                {poItem.lot_size}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  value={poItem.qty}
                                  onChange={(e) =>
                                    handleUpdateQty(
                                      internalId,
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="w-24 text-right"
                                  min="0"
                                  step={poItem.lot_size}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  value={poItem.unit_cost}
                                  onChange={(e) =>
                                    handleUpdateUnitCost(
                                      internalId,
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-24 text-right"
                                  min="0"
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                ¥{(poItem.qty * poItem.unit_cost).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveItem(internalId)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>

          {/* サイドバー：発注サマリー */}
          <div className="lg:col-span-1">
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
                    placeholder="例: サプライヤーA"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note">備考</Label>
                  <Textarea
                    id="note"
                    placeholder="発注に関するメモを入力..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">選択品目数</span>
                    <span className="font-semibold text-foreground">
                      {selectedItems.size} 件
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">合計数量</span>
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
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={selectedItems.size === 0}
                  onClick={() => setShowConfirmDialog(true)}
                >
                  発注ドラフトを作成
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  ドラフトとして保存後、確認して送信できます
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* 確認ダイアログ */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>発注ドラフトを作成しますか？</DialogTitle>
            <DialogDescription>
              以下の内容で発注ドラフトを作成します
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">サプライヤー</span>
              <span className="font-medium">{supplier || '未指定'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">品目数</span>
              <span className="font-medium">{selectedItems.size} 件</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">合計数量</span>
              <span className="font-mono font-medium">
                {getTotalQty().toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-3">
              <span className="font-medium text-muted-foreground">合計金額</span>
              <span className="text-lg font-bold text-primary">
                ¥{getTotalAmount().toLocaleString()}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? '作成中...' : '作成する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
