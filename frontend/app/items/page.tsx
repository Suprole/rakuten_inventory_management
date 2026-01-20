'use client';

import { useEffect, useMemo, useState } from 'react';
import { Navigation } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { Search, ArrowUpDown, Package } from 'lucide-react';
import { type ItemMetric } from '@/lib/view-schema';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Loading from './loading';
import { useItemMetrics } from '@/lib/use-view';
import { useDebouncedValue } from '@/lib/use-debounced';

type SortField = 'name' | 'derived_stock' | 'avg_daily_consumption' | 'days_of_cover' | 'reorder_qty_suggested';
type SortDirection = 'asc' | 'desc';

const SORT_FIELDS: SortField[] = ['name', 'derived_stock', 'avg_daily_consumption', 'days_of_cover', 'reorder_qty_suggested'];

function parseSortField(v: string | null): SortField {
  return (v && SORT_FIELDS.includes(v as SortField) ? (v as SortField) : 'days_of_cover');
}
function parseSortDirection(v: string | null): SortDirection {
  return v === 'desc' ? 'desc' : 'asc';
}

export default function ItemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('query') || '');
  const [riskFilter, setRiskFilter] = useState<string>(searchParams?.get('risk') || 'all');
  const [sortField, setSortField] = useState<SortField>(parseSortField(searchParams?.get('sort') || null));
  const [sortDirection, setSortDirection] = useState<SortDirection>(parseSortDirection(searchParams?.get('dir') || null));

  const itemMetricsState = useItemMetrics();
  const itemMetrics = useMemo(() => itemMetricsState.data ?? [], [itemMetricsState.data]);
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  // URLクエリ同期（検索はdebounce、フィルタ/ソートは即時）
  useEffect(() => {
    const params = new URLSearchParams();
    const q = debouncedQuery.trim();
    if (q) params.set('query', q);
    if (riskFilter && riskFilter !== 'all') params.set('risk', riskFilter);
    if (sortField !== 'days_of_cover') params.set('sort', sortField);
    if (sortDirection !== 'asc') params.set('dir', sortDirection);

    const qs = params.toString();
    const url = qs ? `/items?${qs}` : '/items';
    router.replace(url, { scroll: false });
  }, [debouncedQuery, riskFilter, sortField, sortDirection, router]);

  // 戻る/進む等でURLが変わったとき、入力状態に追従
  useEffect(() => {
    const q = searchParams?.get('query') || '';
    const r = searchParams?.get('risk') || 'all';
    const sf = parseSortField(searchParams?.get('sort') || null);
    const sd = parseSortDirection(searchParams?.get('dir') || null);
    if (q !== searchQuery) setSearchQuery(q);
    if (r !== riskFilter) setRiskFilter(r);
    if (sf !== sortField) setSortField(sf);
    if (sd !== sortDirection) setSortDirection(sd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const filteredAndSortedItems = useMemo(() => {
    let items = itemMetrics;

    // 検索フィルタ
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.internal_id.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query)
      );
    }

    // リスクレベルフィルタ
    if (riskFilter !== 'all') {
      items = items.filter((item) => item.risk_level === riskFilter);
    }

    // ソート
    items = [...items].sort((a, b) => {
      const getSortValue = (item: ItemMetric): number | string => {
        switch (sortField) {
          case 'name':
            return item.name;
          case 'derived_stock':
            return item.derived_stock;
          case 'avg_daily_consumption':
            return item.avg_daily_consumption;
          case 'days_of_cover':
            return item.avg_daily_consumption === 0 ? Infinity : item.days_of_cover ?? 0;
          case 'reorder_qty_suggested':
            return item.reorder_qty_suggested;
        }
      };

      const aVal = getSortValue(a);
      const bVal = getSortValue(b);

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const aNum = aVal as number;
      const bNum = bVal as number;
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return items;
  }, [itemMetrics, searchQuery, riskFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getRiskBadge = (level: ItemMetric['risk_level']) => {
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
      <Badge className={cn('font-medium', variants[level])}>{labels[level]}</Badge>
    );
  };

  const formatDaysOfCover = (item: ItemMetric) => {
    if (item.avg_daily_consumption === 0) {
      return '∞';
    }
    return (item.days_of_cover ?? 0).toFixed(1);
  };

  return (
    <Suspense fallback={<Loading />}>
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
              <Package className="h-8 w-8" />
              在庫一覧
            </h1>
            <p className="mt-2 text-muted-foreground">
              社内ID単位での在庫状況・需要予測・発注推奨
            </p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>検索・フィルタ</CardTitle>
              <CardDescription>
                社内IDや商品名で検索、リスクレベルでフィルタリング
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {itemMetricsState.status === 'error' && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <div className="flex items-center justify-between gap-3">
                    <span>データ取得に失敗しました: {itemMetricsState.error}</span>
                    <Button variant="outline" size="sm" onClick={itemMetricsState.refresh} className="bg-transparent">
                      再試行
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="社内ID、商品名で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    disabled={itemMetrics.length === 0 && itemMetricsState.status === 'loading'}
                  />
                </div>
                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="リスクレベル" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="red">危険（赤）</SelectItem>
                    <SelectItem value="yellow">警告（黄）</SelectItem>
                    <SelectItem value="green">安全（緑）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  全{itemMetrics.length ? itemMetrics.length : itemMetricsState.status === 'loading' ? '-' : 0}件
                </Badge>
                <Badge variant="outline" className="text-xs">
                  表示中: {filteredAndSortedItems.length}件
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold">リスク</TableHead>
                      <TableHead className="font-semibold">社内ID</TableHead>
                      <TableHead
                        className="cursor-pointer font-semibold hover:text-foreground"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          商品名
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('derived_stock')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          在庫数
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('avg_daily_consumption')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          日次消費
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('days_of_cover')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          在庫日数
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('reorder_qty_suggested')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          発注推奨
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemMetricsState.status === 'loading' ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          <p className="text-muted-foreground">読み込み中...</p>
                        </TableCell>
                      </TableRow>
                    ) : itemMetricsState.status === 'error' && filteredAndSortedItems.length > 0 ? (
                      filteredAndSortedItems.map((item) => (
                        <TableRow
                          key={item.internal_id}
                          className="cursor-pointer hover:bg-accent/50"
                          role="link"
                          tabIndex={0}
                          onClick={() => router.push(`/items/${item.internal_id}`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              router.push(`/items/${item.internal_id}`);
                            }
                          }}
                        >
                          <TableCell>{getRiskBadge(item.risk_level)}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.internal_id}
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.name}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.derived_stock.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.avg_daily_consumption.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span
                              className={cn(
                                item.risk_level === 'red' && 'text-destructive',
                                item.risk_level === 'yellow' && 'text-warning'
                              )}
                            >
                              {formatDaysOfCover(item)}日
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.reorder_qty_suggested > 0 ? (
                              <span className="font-semibold text-primary">
                                {item.reorder_qty_suggested.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : filteredAndSortedItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          <p className="text-muted-foreground">
                            該当する商品が見つかりませんでした
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAndSortedItems.map((item) => (
                        <TableRow
                          key={item.internal_id}
                          className="cursor-pointer hover:bg-accent/50"
                          role="link"
                          tabIndex={0}
                          onClick={() => router.push(`/items/${item.internal_id}`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              router.push(`/items/${item.internal_id}`);
                            }
                          }}
                        >
                          <TableCell>{getRiskBadge(item.risk_level)}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.internal_id}
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.name}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.derived_stock.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.avg_daily_consumption.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span
                              className={cn(
                                item.risk_level === 'red' && 'text-destructive',
                                item.risk_level === 'yellow' && 'text-warning'
                              )}
                            >
                              {formatDaysOfCover(item)}日
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.reorder_qty_suggested > 0 ? (
                              <span className="font-semibold text-primary">
                                {item.reorder_qty_suggested.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
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
    </Suspense>
  );
}
