'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigation } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, ArrowUpDown, Package, ShoppingCart, Plus, Download } from 'lucide-react';
import { type DisplayRiskLevel, type ItemMetric } from '@/lib/view-schema';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Loading from './loading';
import { useItemMetrics } from '@/lib/use-view';
import { useDebouncedValue } from '@/lib/use-debounced';
import { useCart } from '@/lib/use-cart';
import { usePoLastSentByItem } from '@/lib/use-po';
import { useItemHandlingRecords } from '@/lib/use-master';
import {
  DISPLAY_RISK_LABELS,
  DISPLAY_RISK_VARIANTS,
  getDisplayRiskLabel,
  getDisplayRiskTextClass,
  getEffectiveDisplayRisk,
} from '@/lib/item-risk';
import type { ItemHandlingRecord } from '@/lib/master-schema';

type SortField =
  | 'internal_id'
  | 'name'
  | 'derived_stock'
  | 'inventory_amount'
  | 'sales_last_month'
  | 'sales_this_month'
  | 'days_of_cover'
  | 'reorder_qty_suggested';
type SortDirection = 'asc' | 'desc';
type RiskFilter = DisplayRiskLevel;
type LastSentInfo = { last_sent_at: string; last_po_id: string };

const SORT_FIELDS: SortField[] = [
  'internal_id',
  'name',
  'derived_stock',
  'inventory_amount',
  'sales_last_month',
  'sales_this_month',
  'days_of_cover',
  'reorder_qty_suggested',
];

const RISK_FILTER_OPTIONS: Array<{ value: RiskFilter; label: string }> = [
  { value: 'red', label: '危険' },
  { value: 'yellow', label: '警告' },
  { value: 'green', label: '安全' },
  { value: 'surplus', label: '余剰' },
  { value: 'dormant', label: '休眠' },
  { value: 'deferred', label: '見送り' },
];

function parseSortField(v: string | null): SortField {
  return (v && SORT_FIELDS.includes(v as SortField) ? (v as SortField) : 'days_of_cover');
}
function parseSortDirection(v: string | null): SortDirection {
  return v === 'desc' ? 'desc' : 'asc';
}

function isRiskFilter(v: string): v is RiskFilter {
  return v === 'red' || v === 'yellow' || v === 'green' || v === 'surplus' || v === 'dormant' || v === 'deferred';
}

function normalizeRiskFilters(values: Iterable<string>): RiskFilter[] {
  const valueSet = new Set<string>(values);
  return RISK_FILTER_OPTIONS.map((option) => option.value).filter((value) => valueSet.has(value));
}

function parseRiskFilters(v: string | null): RiskFilter[] {
  if (!v) return [];
  return normalizeRiskFilters(
    v
      .split(',')
      .map((value) => value.trim())
      .filter(isRiskFilter)
  );
}

function toggleRiskFilter(filters: RiskFilter[], next: RiskFilter): RiskFilter[] {
  return filters.includes(next)
    ? filters.filter((value) => value !== next)
    : normalizeRiskFilters([...filters, next]);
}

function areRiskFiltersEqual(a: RiskFilter[], b: RiskFilter[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function matchesItemQuery(item: ItemMetric, q: string): boolean {
  const qq = q.trim().toLowerCase();
  if (!qq) return true;
  if (item.internal_id.toLowerCase().includes(qq)) return true;
  if (item.name.toLowerCase().includes(qq)) return true;
  // SKU/商品管理番号/楽天タイトル（ETLがlistingsを埋め込んでいる場合）
  if (item.listings && item.listings.length > 0) {
    for (const l of item.listings) {
      if (l.rakuten_item_no.toLowerCase().includes(qq)) return true;
      if (l.rakuten_sku.toLowerCase().includes(qq)) return true;
      if (l.title.toLowerCase().includes(qq)) return true;
    }
  }
  return false;
}

function parseInternalIds(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  // Excel/スプレッドシート貼り付けを想定して、タブ/改行/空白/カンマ（全角含む）を区切りにする
  const parts = s
    .split(/[\s\u3000,，、]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.toLowerCase());
  return Array.from(new Set(parts));
}

function formatYen(value: number): string {
  return `¥${Math.round(value || 0).toLocaleString()}`;
}

function getRiskBadge(level: DisplayRiskLevel) {
  return <Badge className={cn('font-medium', DISPLAY_RISK_VARIANTS[level])}>{DISPLAY_RISK_LABELS[level]}</Badge>;
}

function getRiskLabel(level: DisplayRiskLevel) {
  return getDisplayRiskLabel(level);
}

function formatDaysOfCover(item: ItemMetric) {
  if (item.derived_stock === 0) {
    return '0.0';
  }
  if (item.avg_daily_consumption === 0) {
    return '∞';
  }
  return (item.days_of_cover ?? 0).toFixed(1);
}

function formatSales(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return v.toLocaleString();
}

function formatDateOnly(dateString: string) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const SalesInline = memo(function SalesInline({
  metro,
  windy,
  yahoo,
}: {
  metro: number | null | undefined;
  windy: number | null | undefined;
  yahoo: number | null | undefined;
}) {
  return (
    <div className="flex justify-end gap-1 whitespace-nowrap font-mono text-xs tabular-nums">
      <span>
        <span className="text-muted-foreground">M</span>
        {formatSales(metro)}
      </span>
      <span>
        <span className="text-muted-foreground">W</span>
        {formatSales(windy)}
      </span>
      <span>
        <span className="text-muted-foreground">Y</span>
        {formatSales(yahoo)}
      </span>
    </div>
  );
});

const ItemTableRow = memo(function ItemTableRow({
  item,
  displayRisk,
  canOpenDefer,
  hasDeferredHandling,
  lastSent,
  inCart,
  onOpenItem,
  onOpenCart,
  onAddToCart,
  onOpenDefer,
}: {
  item: ItemMetric;
  displayRisk: DisplayRiskLevel;
  canOpenDefer: boolean;
  hasDeferredHandling: boolean;
  lastSent?: LastSentInfo;
  inCart: boolean;
  onOpenItem: (internalId: string) => void;
  onOpenCart: () => void;
  onAddToCart: (item: ItemMetric) => void;
  onOpenDefer: (item: ItemMetric) => void;
}) {
  const inventoryAmount = item.derived_stock * (item.default_unit_cost ?? 0);

  return (
    <TableRow
      className="cursor-pointer hover:bg-accent/50"
      role="link"
      tabIndex={0}
      onClick={() => onOpenItem(item.internal_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenItem(item.internal_id);
        }
      }}
    >
      <TableCell>{getRiskBadge(displayRisk)}</TableCell>
      <TableCell className="font-mono text-sm">{item.internal_id}</TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {!lastSent || !lastSent.last_sent_at ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span title={`PO: ${lastSent.last_po_id}`}>{formatDateOnly(lastSent.last_sent_at)}</span>
        )}
      </TableCell>
      <TableCell className="font-medium">
        <span title={item.name} className="block max-w-[220px] truncate">
          {item.name}
        </span>
      </TableCell>
      <TableCell className="text-right font-mono pr-2">{item.derived_stock.toLocaleString()}</TableCell>
      <TableCell className="text-right font-mono pr-2">{formatYen(inventoryAmount)}</TableCell>
      <TableCell className="text-right pl-2 pr-2">
        <SalesInline
          metro={item.metro_last_month_sales}
          windy={item.windy_last_month_sales}
          yahoo={item.yahoo_last_month_sales}
        />
      </TableCell>
      <TableCell className="text-right pl-2">
        <SalesInline
          metro={item.metro_this_month_sales}
          windy={item.windy_this_month_sales}
          yahoo={item.yahoo_this_month_sales}
        />
      </TableCell>
      <TableCell className="text-right font-mono">
        <span className={getDisplayRiskTextClass(displayRisk)}>
          {formatDaysOfCover(item)}日
        </span>
      </TableCell>
      <TableCell className="text-right font-mono">
        {item.reorder_qty_suggested > 0 ? (
          <span className="font-semibold text-primary">{item.reorder_qty_suggested.toLocaleString()}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          {inCart ? (
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenCart();
              }}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              カートへ
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToCart(item);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              追加
            </Button>
          )}
          <Button
            variant={hasDeferredHandling ? 'default' : 'outline'}
            size="sm"
            className={cn('bg-transparent', hasDeferredHandling && 'bg-muted text-foreground hover:bg-muted/90')}
            disabled={!canOpenDefer}
            title={
              canOpenDefer
                ? '発注見送りを設定'
                : '見送り設定は危険・警告、または見送り設定済みの商品で利用できます'
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenDefer(item);
            }}
          >
            {hasDeferredHandling ? '見送り設定' : '見送り'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

export default function ItemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('query') || '');
  const [internalIdsRaw, setInternalIdsRaw] = useState(searchParams?.get('ids') || '');
  const [riskFilters, setRiskFilters] = useState<RiskFilter[]>(parseRiskFilters(searchParams?.get('risk') || null));
  const [sortField, setSortField] = useState<SortField>(parseSortField(searchParams?.get('sort') || null));
  const [sortDirection, setSortDirection] = useState<SortDirection>(parseSortDirection(searchParams?.get('dir') || null));

  const itemMetricsState = useItemMetrics();
  const itemMetrics = useMemo(() => itemMetricsState.data ?? [], [itemMetricsState.data]);
  const itemHandlingState = useItemHandlingRecords();
  const itemHandlingRecords = useMemo(() => itemHandlingState.data ?? [], [itemHandlingState.data]);
  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const debouncedInternalIdsRaw = useDebouncedValue(internalIdsRaw, 300);
  const debouncedRiskFilters = useDebouncedValue(riskFilters, 180);
  const cart = useCart();
  const lastSentState = usePoLastSentByItem();
  const lastSentItems = useMemo(() => lastSentState.data ?? [], [lastSentState.data]);
  const lastSentByInternalId = useMemo(() => {
    const m = new Map<string, { last_sent_at: string; last_po_id: string }>();
    for (const it of lastSentItems) {
      if (!it.internal_id) continue;
      m.set(it.internal_id, { last_sent_at: it.last_sent_at, last_po_id: it.last_po_id });
    }
    return m;
  }, [lastSentItems]);
  const handlingByInternalId = useMemo(() => {
    const m = new Map<string, ItemHandlingRecord>();
    for (const it of itemHandlingRecords) {
      if (!it.internal_id) continue;
      m.set(it.internal_id, it);
    }
    return m;
  }, [itemHandlingRecords]);
  const displayRiskByInternalId = useMemo(() => {
    const m = new Map<string, DisplayRiskLevel>();
    for (const item of itemMetrics) {
      m.set(item.internal_id, getEffectiveDisplayRisk(item, handlingByInternalId.get(item.internal_id)));
    }
    return m;
  }, [itemMetrics, handlingByInternalId]);
  const lines = cart.lines;
  const isInCart = useMemo(() => {
    const set = new Set(lines.map((l) => l.internal_id));
    return (internalId: string) => set.has(internalId);
  }, [lines]);
  const [handlingDialogItemId, setHandlingDialogItemId] = useState<string | null>(null);
  const handlingDialogItem = useMemo(
    () => itemMetrics.find((item) => item.internal_id === handlingDialogItemId),
    [itemMetrics, handlingDialogItemId]
  );
  const [handlingStatusDraft, setHandlingStatusDraft] = useState<'normal' | 'deferred'>('normal');
  const [handlingUntilDraft, setHandlingUntilDraft] = useState('');
  const [handlingNoteDraft, setHandlingNoteDraft] = useState('');
  const [isHandlingSaving, setIsHandlingSaving] = useState(false);
  const [handlingDialogError, setHandlingDialogError] = useState('');

  // URLクエリ同期（検索とリスクはdebounceし、テーブル反映の体感を優先）
  useEffect(() => {
    const params = new URLSearchParams();
    const q = debouncedQuery.trim();
    const ids = debouncedInternalIdsRaw.trim();
    if (q) params.set('query', q);
    if (ids) params.set('ids', ids);
    if (debouncedRiskFilters.length > 0) params.set('risk', debouncedRiskFilters.join(','));
    if (sortField !== 'days_of_cover') params.set('sort', sortField);
    if (sortDirection !== 'asc') params.set('dir', sortDirection);

    const qs = params.toString();
    const url = qs ? `/items?${qs}` : '/items';
    router.replace(url, { scroll: false });
  }, [debouncedQuery, debouncedInternalIdsRaw, debouncedRiskFilters, sortField, sortDirection, router]);

  // 戻る/進む等でURLが変わったとき、入力状態に追従
  useEffect(() => {
    const q = searchParams?.get('query') || '';
    const ids = searchParams?.get('ids') || '';
    const r = parseRiskFilters(searchParams?.get('risk') || null);
    const sf = parseSortField(searchParams?.get('sort') || null);
    const sd = parseSortDirection(searchParams?.get('dir') || null);
    if (q !== searchQuery) setSearchQuery(q);
    if (ids !== internalIdsRaw) setInternalIdsRaw(ids);
    if (!areRiskFiltersEqual(r, riskFilters)) setRiskFilters(r);
    if (sf !== sortField) setSortField(sf);
    if (sd !== sortDirection) setSortDirection(sd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const filteredAndSortedItems = useMemo(() => {
    let items = itemMetrics;

    // 社内IDリスト（完全一致）フィルタ
    if (internalIdsRaw.trim()) {
      const ids = parseInternalIds(internalIdsRaw);
      if (ids.length > 0) {
        const set = new Set(ids);
        items = items.filter((item) => set.has(item.internal_id.toLowerCase()));
      }
    }

    // 検索フィルタ
    if (searchQuery) {
      items = items.filter((item) => matchesItemQuery(item, searchQuery));
    }

    // リスクレベルフィルタ
    if (riskFilters.length > 0) {
      const selectedRisks = new Set(riskFilters);
      items = items.filter((item) => selectedRisks.has(displayRiskByInternalId.get(item.internal_id) ?? item.risk_level));
    }

    // ソート
    items = [...items].sort((a, b) => {
      const getSortValue = (item: ItemMetric): number | string => {
        switch (sortField) {
          case 'internal_id':
            return item.internal_id;
          case 'name':
            return item.name;
          case 'derived_stock':
            return item.derived_stock;
          case 'inventory_amount':
            return item.derived_stock * (item.default_unit_cost ?? 0);
          case 'sales_last_month': {
            const m = item.metro_last_month_sales ?? 0;
            const w = item.windy_last_month_sales ?? 0;
            const y = item.yahoo_last_month_sales ?? 0;
            return m + w + y;
          }
          case 'sales_this_month': {
            const m = item.metro_this_month_sales ?? 0;
            const w = item.windy_this_month_sales ?? 0;
            const y = item.yahoo_this_month_sales ?? 0;
            return m + w + y;
          }
          case 'days_of_cover':
            return item.avg_daily_consumption === 0 ? Infinity : item.days_of_cover ?? 0;
          case 'reorder_qty_suggested':
            return item.reorder_qty_suggested;
        }
      };

      const aVal = getSortValue(a);
      const bVal = getSortValue(b);

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        // 社内IDは「A-2」「A-10」等の自然順に寄せる（必要なら数字部分を考慮）
        if (sortField === 'internal_id') {
          const opt: Intl.CollatorOptions = { numeric: true, sensitivity: 'base' };
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal, 'ja', opt)
            : bVal.localeCompare(aVal, 'ja', opt);
        }
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const aNum = aVal as number;
      const bNum = bVal as number;
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return items;
  }, [itemMetrics, internalIdsRaw, searchQuery, riskFilters, sortField, sortDirection, displayRiskByInternalId]);

  const totals = useMemo(() => {
    return filteredAndSortedItems.reduce(
      (acc, item) => {
        const inventoryAmount = item.derived_stock * (item.default_unit_cost ?? 0);
        acc.derivedStock += item.derived_stock ?? 0;
        acc.metroLastMonth += item.metro_last_month_sales ?? 0;
        acc.windyLastMonth += item.windy_last_month_sales ?? 0;
        acc.yahooLastMonth += item.yahoo_last_month_sales ?? 0;
        acc.metroThisMonth += item.metro_this_month_sales ?? 0;
        acc.windyThisMonth += item.windy_this_month_sales ?? 0;
        acc.yahooThisMonth += item.yahoo_this_month_sales ?? 0;
        acc.inventoryAmount += inventoryAmount;
        acc.reorderSuggested += item.reorder_qty_suggested ?? 0;
        return acc;
      },
      {
        derivedStock: 0,
        metroLastMonth: 0,
        windyLastMonth: 0,
        yahooLastMonth: 0,
        metroThisMonth: 0,
        windyThisMonth: 0,
        yahooThisMonth: 0,
        inventoryAmount: 0,
        reorderSuggested: 0,
      }
    );
  }, [filteredAndSortedItems]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // 二重発注防止目的：索引は軽量なので短い間隔で再取得（画面表示中のみ）
  useEffect(() => {
    const intervalMs = 30_000;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      lastSentState.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openItemDetail = useCallback((internalId: string) => {
    router.push(`/items/${internalId}`);
  }, [router]);

  const openCart = useCallback(() => {
    router.push('/po/cart');
  }, [router]);

  const addToCart = useCallback((item: ItemMetric) => {
    cart.actions.addToCart({
      internal_id: item.internal_id,
      name: item.name,
      qty: 0,
      unit_cost: item.default_unit_cost ?? 0,
      recommended_qty: item.reorder_qty_suggested,
      order_pack: item.order_pack,
      order_unit: item.order_unit,
      order_amount: item.order_amount,
      basis_need_qty: item.need_qty,
      basis_days_of_cover: item.days_of_cover === null ? undefined : item.days_of_cover,
    });
  }, [cart.actions]);

  const openHandlingDialog = useCallback((item: ItemMetric) => {
    const current = handlingByInternalId.get(item.internal_id);
    setHandlingDialogItemId(item.internal_id);
    setHandlingStatusDraft(current?.handling_status === 'deferred' ? 'deferred' : 'normal');
    setHandlingUntilDraft(current?.suppress_until || '');
    setHandlingNoteDraft(current?.note || '');
    setHandlingDialogError('');
  }, [handlingByInternalId]);

  const closeHandlingDialog = useCallback((open: boolean) => {
    if (open) return;
    if (isHandlingSaving) return;
    setHandlingDialogItemId(null);
    setHandlingDialogError('');
  }, [isHandlingSaving]);

  const saveHandling = useCallback(async () => {
    if (!handlingDialogItem) return;
    setIsHandlingSaving(true);
    setHandlingDialogError('');
    try {
      const res = await fetch('/api/master/item-handling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internal_id: handlingDialogItem.internal_id,
          handling_status: handlingStatusDraft,
          suppress_until: handlingStatusDraft === 'deferred' && handlingUntilDraft ? handlingUntilDraft : undefined,
          note: handlingNoteDraft.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || '見送り設定の保存に失敗しました');
      }
      itemHandlingState.refresh();
      itemMetricsState.refresh();
      setHandlingDialogItemId(null);
    } catch (e) {
      setHandlingDialogError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsHandlingSaving(false);
    }
  }, [handlingDialogItem, handlingStatusDraft, handlingUntilDraft, handlingNoteDraft, itemHandlingState, itemMetricsState]);

  const renderedRows = useMemo(
    () =>
      filteredAndSortedItems.map((item) => (
        (() => {
          const handling = handlingByInternalId.get(item.internal_id);
          const canOpenDefer =
            item.risk_level === 'red' ||
            item.risk_level === 'yellow' ||
            handling?.handling_status === 'deferred';
          return (
        <ItemTableRow
          key={item.internal_id}
          item={item}
          displayRisk={displayRiskByInternalId.get(item.internal_id) ?? item.risk_level}
          canOpenDefer={canOpenDefer}
          hasDeferredHandling={handling?.handling_status === 'deferred'}
          lastSent={lastSentByInternalId.get(item.internal_id)}
          inCart={isInCart(item.internal_id)}
          onOpenItem={openItemDetail}
          onOpenCart={openCart}
          onAddToCart={addToCart}
          onOpenDefer={openHandlingDialog}
        />
          );
        })()
      )),
    [filteredAndSortedItems, handlingByInternalId, displayRiskByInternalId, lastSentByInternalId, isInCart, openItemDetail, openCart, addToCart, openHandlingDialog]
  );

  const downloadCsv = () => {
    const rows: string[][] = [];
    rows.push([
      '表示ステータス',
      '実リスク',
      '社内ID',
      '商品名',
      '在庫数',
      '売上（先月）M',
      '売上（先月）W',
      '売上（先月）Y',
      '売上（今月）M',
      '売上（今月）W',
      '売上（今月）Y',
      '在庫日数',
      '発注推奨',
    ]);

    for (const item of filteredAndSortedItems) {
      const displayRisk = displayRiskByInternalId.get(item.internal_id) ?? item.risk_level;
      rows.push([
        getRiskLabel(displayRisk),
        getDisplayRiskLabel(item.risk_level),
        item.internal_id,
        item.name,
        String(item.derived_stock ?? 0),
        String(item.metro_last_month_sales ?? 0),
        String(item.windy_last_month_sales ?? 0),
        String(item.yahoo_last_month_sales ?? 0),
        String(item.metro_this_month_sales ?? 0),
        String(item.windy_this_month_sales ?? 0),
        String(item.yahoo_this_month_sales ?? 0),
        String(formatDaysOfCover(item)),
        String(item.reorder_qty_suggested ?? 0),
      ]);
    }

    const esc = (v: string) => {
      const s = v ?? '';
      // CSVの標準エスケープ（" を "" にし、必要なら全体を "..." で囲む）
      const needsQuote = /[",\r\n]/.test(s);
      const quoted = s.replace(/"/g, '""');
      return needsQuote ? `"${quoted}"` : quoted;
    };

    const csvBody = rows.map((r) => r.map(esc).join(',')).join('\r\n');
    // Excel互換（UTF-8 BOM）
    const csv = `\ufeff${csvBody}\r\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const filename = `在庫一覧_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(
      now.getHours()
    )}${pad2(now.getMinutes())}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Suspense fallback={<Loading />}>
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="w-full px-2 py-8 sm:px-3 lg:px-4">
          <Dialog open={handlingDialogItemId !== null} onOpenChange={closeHandlingDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>発注見送り設定</DialogTitle>
                <DialogDescription>
                  一覧から直接、危険・警告商品の見送り設定を保存します。
                </DialogDescription>
              </DialogHeader>
              {handlingDialogItem && (
                <div className="space-y-4">
                  <div className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{handlingDialogItem.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{handlingDialogItem.internal_id}</div>
                      </div>
                      {getRiskBadge(displayRiskByInternalId.get(handlingDialogItem.internal_id) ?? handlingDialogItem.risk_level)}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      実リスク: {getDisplayRiskLabel(handlingDialogItem.risk_level)}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>設定</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={handlingStatusDraft === 'deferred' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setHandlingStatusDraft('deferred')}
                        disabled={isHandlingSaving}
                      >
                        見送りにする
                      </Button>
                      <Button
                        type="button"
                        variant={handlingStatusDraft === 'normal' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setHandlingStatusDraft('normal')}
                        disabled={isHandlingSaving}
                      >
                        解除
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="handling-until">見送り期限</Label>
                    <Input
                      id="handling-until"
                      type="date"
                      value={handlingUntilDraft}
                      onChange={(e) => setHandlingUntilDraft(e.target.value)}
                      disabled={isHandlingSaving || handlingStatusDraft !== 'deferred'}
                    />
                    <p className="text-xs text-muted-foreground">未入力なら解除するまで見送りを維持します。</p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="handling-note">理由メモ</Label>
                    <Textarea
                      id="handling-note"
                      value={handlingNoteDraft}
                      onChange={(e) => setHandlingNoteDraft(e.target.value)}
                      placeholder="例: 季節商品のため今月は発注見送り"
                      className="min-h-24"
                      disabled={isHandlingSaving}
                    />
                  </div>

                  {handlingStatusDraft === 'deferred' &&
                    handlingDialogItem.risk_level !== 'red' &&
                    handlingDialogItem.risk_level !== 'yellow' && (
                      <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                        現在の実リスクは危険・警告ではないため、保存しても表示ステータスは見送りに変わりません。
                      </div>
                    )}

                  {handlingDialogError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      {handlingDialogError}
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-transparent"
                  onClick={() => closeHandlingDialog(false)}
                  disabled={isHandlingSaving}
                >
                  キャンセル
                </Button>
                <Button type="button" onClick={saveHandling} disabled={isHandlingSaving || !handlingDialogItem}>
                  {isHandlingSaving ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
                <Package className="h-8 w-8" />
                在庫一覧
              </h1>
              <p className="mt-2 text-muted-foreground">
                社内ID単位での在庫状況・需要予測・発注推奨
              </p>
            </div>
            <Button variant="outline" className="bg-transparent" onClick={openCart}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              カート
              {cart.lineCount > 0 && (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                  {cart.lineCount}
                </span>
              )}
            </Button>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>検索・フィルタ</CardTitle>
                  <CardDescription className="mt-1">
                    ID複数検索や商品名で検索、リスクレベルでフィルタリング
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  className="bg-transparent"
                  onClick={downloadCsv}
                  disabled={filteredAndSortedItems.length === 0 || itemMetricsState.status === 'loading'}
                  title="現在の表示結果（フィルタ/ソート後）をCSVでダウンロード"
                >
                  <Download className="mr-2 h-4 w-4" />
                  CSVダウンロード
                </Button>
              </div>
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
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">リスクレベル</div>
                  <div className="text-xs text-muted-foreground">複数選択可</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={riskFilters.length === 0 ? 'default' : 'outline'}
                    className="bg-transparent"
                    onClick={() => setRiskFilters([])}
                  >
                    すべて
                  </Button>
                  {RISK_FILTER_OPTIONS.map((option) => {
                    const active = riskFilters.includes(option.value);
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        className={cn(
                          'bg-transparent',
                          active && 'border-transparent text-primary-foreground',
                          active && option.value === 'red' && 'bg-destructive hover:bg-destructive/90',
                          active && option.value === 'yellow' && 'bg-warning hover:bg-warning/90',
                          active && option.value === 'green' && 'bg-success hover:bg-success/90',
                          active && option.value === 'surplus' && 'bg-surplus hover:bg-surplus/90',
                          active && option.value === 'dormant' && 'bg-dormant hover:bg-dormant/90',
                          active && option.value === 'deferred' && 'bg-muted text-foreground hover:bg-muted/90'
                        )}
                        onClick={() => setRiskFilters((current) => toggleRiskFilter(current, option.value))}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">社内ID複数検索</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                    onClick={() => setInternalIdsRaw('')}
                    disabled={!internalIdsRaw.trim()}
                    title="ID複数検索をクリア"
                  >
                    クリア
                  </Button>
                </div>
                <Textarea
                  placeholder="例: A-001, A-002（タブ/スペース/カンマ/改行区切りで複数入力OK）"
                  value={internalIdsRaw}
                  onChange={(e) => setInternalIdsRaw(e.target.value)}
                  className="min-h-20 font-mono text-sm"
                  disabled={itemMetrics.length === 0 && itemMetricsState.status === 'loading'}
                />
                {internalIdsRaw.trim() && (
                  <div className="text-xs text-muted-foreground">
                    入力ID数: {parseInternalIds(internalIdsRaw).length}（一致した社内IDのみ表示）
                  </div>
                )}
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
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky top-0 z-20 w-[76px] bg-card font-semibold">リスク</TableHead>
                      <TableHead
                        className="sticky top-0 z-20 w-[132px] cursor-pointer bg-card font-semibold hover:text-foreground"
                        onClick={() => handleSort('internal_id')}
                      >
                        <div className="flex items-center gap-1">
                          社内ID
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 w-[110px] bg-card font-semibold" title="最終発注（送信）日">
                        最終発注
                      </TableHead>
                      <TableHead
                        className="sticky top-0 z-20 w-[220px] cursor-pointer bg-card font-semibold hover:text-foreground"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          商品名
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="sticky top-0 z-20 w-[88px] cursor-pointer bg-card pr-2 text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('derived_stock')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          在庫数
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="sticky top-0 z-20 w-[120px] cursor-pointer bg-card text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('inventory_amount')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          在庫金額
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="sticky top-0 z-20 w-[140px] cursor-pointer bg-card pl-2 pr-2 text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('sales_last_month')}
                        title="（metro+windy+yahoo）合計でソート"
                      >
                        <div className="flex items-center justify-end gap-1">
                          売上（先月）
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="sticky top-0 z-20 w-[140px] cursor-pointer bg-card pl-2 text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('sales_this_month')}
                        title="（metro+windy+yahoo）合計でソート"
                      >
                        <div className="flex items-center justify-end gap-1">
                          売上（今月）
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="sticky top-0 z-20 w-[80px] cursor-pointer bg-card text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('days_of_cover')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          在庫日数
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="sticky top-0 z-20 w-[80px] cursor-pointer bg-card text-right font-semibold hover:text-foreground"
                        onClick={() => handleSort('reorder_qty_suggested')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          発注推奨
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 w-[220px] bg-card font-semibold">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemMetricsState.status === 'loading' ? (
                      <TableRow>
                        <TableCell colSpan={11} className="h-24 text-center">
                          <p className="text-muted-foreground">読み込み中...</p>
                        </TableCell>
                      </TableRow>
                    ) : itemMetricsState.status === 'error' && filteredAndSortedItems.length > 0 ? (
                      <>
                        <TableRow className="border-b-2 bg-muted/70 hover:bg-muted/70">
                          <TableCell className="sticky top-10 z-10 bg-muted/70 font-semibold">合計</TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70" colSpan={3}>
                            <span className="text-sm text-muted-foreground">
                              表示中 {filteredAndSortedItems.length} 件
                            </span>
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right font-mono font-semibold pr-2">
                            {totals.derivedStock.toLocaleString()}
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right font-mono font-semibold">
                            {formatYen(totals.inventoryAmount)}
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right pl-2 pr-2">
                            <SalesInline
                              metro={totals.metroLastMonth}
                              windy={totals.windyLastMonth}
                              yahoo={totals.yahooLastMonth}
                            />
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right pl-2">
                            <SalesInline
                              metro={totals.metroThisMonth}
                              windy={totals.windyThisMonth}
                              yahoo={totals.yahooThisMonth}
                            />
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right font-mono text-muted-foreground">
                            -
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right font-mono font-semibold">
                            {totals.reorderSuggested > 0 ? totals.reorderSuggested.toLocaleString() : '-'}
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70" />
                        </TableRow>
                        {renderedRows}
                      </>
                    ) : filteredAndSortedItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="h-24 text-center">
                          <p className="text-muted-foreground">
                            該当する商品が見つかりませんでした
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        <TableRow className="border-b-2 bg-muted/70 hover:bg-muted/70">
                          <TableCell className="sticky top-10 z-10 bg-muted/70 font-semibold">合計</TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70" colSpan={3}>
                            <span className="text-sm text-muted-foreground">
                              表示中 {filteredAndSortedItems.length} 件
                            </span>
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right font-mono font-semibold pr-2">
                            {totals.derivedStock.toLocaleString()}
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right font-mono font-semibold">
                            {formatYen(totals.inventoryAmount)}
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right pl-2 pr-2">
                            <SalesInline
                              metro={totals.metroLastMonth}
                              windy={totals.windyLastMonth}
                              yahoo={totals.yahooLastMonth}
                            />
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right pl-2">
                            <SalesInline
                              metro={totals.metroThisMonth}
                              windy={totals.windyThisMonth}
                              yahoo={totals.yahooThisMonth}
                            />
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right font-mono text-muted-foreground">
                            -
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70 text-right font-mono font-semibold">
                            {totals.reorderSuggested > 0 ? totals.reorderSuggested.toLocaleString() : '-'}
                          </TableCell>
                          <TableCell className="sticky top-10 z-10 bg-muted/70" />
                        </TableRow>
                        {renderedRows}
                      </>
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
