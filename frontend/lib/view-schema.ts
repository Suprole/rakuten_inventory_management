import { z } from 'zod';

export const RiskLevelSchema = z.enum(['red', 'yellow', 'green']);

export const ListingMetricSchema = z.object({
  listing_id: z.string(),
  store_id: z.enum(['metro', 'windy']),
  rakuten_item_no: z.string(),
  rakuten_sku: z.string(),
  title: z.string(),
  stock_qty: z.number(),
  last_month_sales: z.number(),
  this_month_sales: z.number(),
  r_hat: z.number(),
  bom_qty: z.number(),
  contribution_stock: z.number(),
  contribution_consumption: z.number(),
});

export const ItemMetricSchema = z.object({
  internal_id: z.string(),
  name: z.string(),
  derived_stock: z.number(),
  avg_daily_consumption: z.number(),
  days_of_cover: z.number().nullable(), // ETL側で∞はnull等に正規化して出す前提
  // 店舗別 売上（社内ID単位、BOM展開後）。ETL未更新に備えて optional
  metro_last_month_sales: z.number().optional(),
  metro_this_month_sales: z.number().optional(),
  windy_last_month_sales: z.number().optional(),
  windy_this_month_sales: z.number().optional(),
  lead_time_days: z.number(),
  safety_stock: z.number(),
  lot_size: z.number(),
  target_cover_days: z.number(),
  need_qty: z.number(),
  reorder_qty_suggested: z.number(),
  risk_level: RiskLevelSchema,
  default_unit_cost: z.number().optional(),
  listings: z.array(ListingMetricSchema).optional(), // 任意（listing内訳を出す場合）
});

export const ItemMetricsSchema = z.array(ItemMetricSchema);

export const MirrorMismatchSchema = z.object({
  rakuten_item_no: z.string(),
  rakuten_sku: z.string(),
  metro_stock_qty: z.number(),
  windy_stock_qty: z.number(),
  diff: z.number(),
});

export const MirrorMismatchesSchema = z.array(MirrorMismatchSchema);

export const UnmappedListingSchema = z.object({
  store_id: z.enum(['metro', 'windy']),
  listing_id: z.string(),
  rakuten_item_no: z.string(),
  rakuten_sku: z.string(),
  stock_qty: z.number(),
  last_month_sales: z.number(),
  this_month_sales: z.number(),
  // ETL側で取れる場合のみ（現状は空/未出力でもOK）
  title: z.string().optional(),
});

export const UnmappedListingsSchema = z.array(UnmappedListingSchema);

export const ListingSnapshotSchema = z.object({
  store_id: z.enum(['metro', 'windy']),
  listing_id: z.string(),
  rakuten_item_no: z.string(),
  rakuten_sku: z.string(),
  stock_qty: z.number(),
  last_month_sales: z.number(),
  this_month_sales: z.number(),
});

export const ListingSnapshotsSchema = z.array(ListingSnapshotSchema);

export type ItemMetric = z.infer<typeof ItemMetricSchema>;
export type MirrorMismatch = z.infer<typeof MirrorMismatchSchema>;
export type UnmappedListing = z.infer<typeof UnmappedListingSchema>;
export type ListingSnapshot = z.infer<typeof ListingSnapshotSchema>;

