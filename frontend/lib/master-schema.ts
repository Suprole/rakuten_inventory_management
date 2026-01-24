import { z } from 'zod';

export const ListingHandlingStatusSchema = z.enum(['normal', 'unavailable']);

export const ListingHandlingUpsertPayloadSchema = z.object({
  listing_id: z.string().min(1),
  store_id: z.enum(['metro', 'windy']).optional(),
  rakuten_item_no: z.string().optional(),
  rakuten_sku: z.string().optional(),
  handling_status: ListingHandlingStatusSchema,
  note: z.string().optional(),
});

export const ListingHandlingUpsertResponseSchema = z.object({
  ok: z.boolean(),
  listing_id: z.string().optional(),
  handling_status: ListingHandlingStatusSchema.optional(),
  updated_at: z.string().optional(),
  updated_by: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export type ListingHandlingUpsertPayload = z.infer<typeof ListingHandlingUpsertPayloadSchema>;

export const ListingHandlingRecordSchema = z.object({
  listing_id: z.string(),
  store_id: z.string().optional(),
  rakuten_item_no: z.string().optional(),
  rakuten_sku: z.string().optional(),
  handling_status: ListingHandlingStatusSchema,
  note: z.string().optional(),
  updated_at: z.string().optional(),
  updated_by: z.string().optional(),
});

export const ListingHandlingListResponseSchema = z.object({
  ok: z.boolean(),
  items: z.array(ListingHandlingRecordSchema).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

