import { z } from 'zod';

export const POStatusSchema = z.enum(['draft', 'sent', 'cancelled']);

export const POHeaderSchema = z.object({
  po_id: z.string(),
  created_at: z.string(),
  status: POStatusSchema,
  supplier: z.string().optional(),
  note: z.string().optional(),
  item_count: z.number().optional(),
  total_qty: z.number().optional(),
});

export const POLineSchema = z.object({
  po_id: z.string(),
  line_no: z.number(),
  internal_id: z.string(),
  qty: z.number(),
  unit_cost: z.number().optional(),
  basis_need_qty: z.number().optional(),
  basis_days_of_cover: z.number().optional(),
});

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
});

export const PoListOkSchema = z.object({
  ok: z.literal(true),
  items: z.array(POHeaderSchema),
});
export const PoListResponseSchema = z.union([PoListOkSchema, ApiErrorSchema]);

export const PoDetailOkSchema = z.object({
  ok: z.literal(true),
  header: POHeaderSchema,
  lines: z.array(POLineSchema),
});
export const PoDetailNotFoundSchema = z.object({
  ok: z.literal(false),
  error: z.literal('not_found'),
});
export const PoDetailResponseSchema = z.union([
  PoDetailOkSchema,
  PoDetailNotFoundSchema,
  ApiErrorSchema,
]);

export const PoCreatePayloadSchema = z.object({
  supplier: z.string().optional(),
  note: z.string().optional(),
  lines: z
    .array(
      z.object({
        internal_id: z.string(),
        qty: z.number(),
        unit_cost: z.number().optional(),
        basis_need_qty: z.number().optional(),
        basis_days_of_cover: z.number().optional(),
      })
    )
    .min(1),
});

export const PoCreateOkSchema = z.object({
  ok: z.literal(true),
  po_id: z.string(),
});
export const PoCreateResponseSchema = z.union([PoCreateOkSchema, ApiErrorSchema]);

export const PoUpdateStatusPayloadSchema = z.object({
  po_id: z.string(),
  status: POStatusSchema,
});
export const PoUpdateStatusOkSchema = z.object({
  ok: z.literal(true),
  // 送信（sent）時のメール送信結果（任意）
  mail_sent: z.boolean().optional(),
  mail_error: z.string().optional(),
});
export const PoUpdateStatusNotFoundSchema = z.object({
  ok: z.literal(false),
  error: z.literal('not_found'),
});
export const PoUpdateStatusResponseSchema = z.union([
  PoUpdateStatusOkSchema,
  PoUpdateStatusNotFoundSchema,
  ApiErrorSchema,
]);

export const PoConfirmPayloadSchema = PoCreatePayloadSchema;

export const PoConfirmOkSchema = z.object({
  ok: z.literal(true),
  po_id: z.string(),
  status: z.literal('sent'),
});
export const PoConfirmMailFailedSchema = z.object({
  ok: z.literal(false),
  error: z.literal('mail_failed'),
  message: z.string().optional(),
  po_id: z.string(),
  status: z.literal('draft'),
});
export const PoConfirmResponseSchema = z.union([
  PoConfirmOkSchema,
  PoConfirmMailFailedSchema,
  ApiErrorSchema,
]);

export const PoDeletePayloadSchema = z.object({
  po_id: z.string(),
});
export const PoDeleteOkSchema = z.object({
  ok: z.literal(true),
});
export const PoDeleteNotFoundSchema = z.object({
  ok: z.literal(false),
  error: z.literal('not_found'),
});
export const PoDeleteCannotDeleteSentSchema = z.object({
  ok: z.literal(false),
  error: z.literal('cannot_delete_sent'),
});
export const PoDeleteResponseSchema = z.union([
  PoDeleteOkSchema,
  PoDeleteNotFoundSchema,
  PoDeleteCannotDeleteSentSchema,
  ApiErrorSchema,
]);

export type POStatus = z.infer<typeof POStatusSchema>;
export type POHeader = z.infer<typeof POHeaderSchema>;
export type POLine = z.infer<typeof POLineSchema>;
export type PoCreatePayload = z.infer<typeof PoCreatePayloadSchema>;
export type PoConfirmPayload = z.infer<typeof PoConfirmPayloadSchema>;

