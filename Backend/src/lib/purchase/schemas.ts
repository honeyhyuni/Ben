import { z } from "zod";
const label = z.string().trim().min(1).max(100);
export const money = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
const sizes = z.array(label).min(1).max(50).refine(v => new Set(v).size === v.length, "Duplicate sizes");
const colors = z.array(z.object({ name: label, hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional() }).strict())
  .min(1).max(50).refine(v => new Set(v.map(c => c.name)).size === v.length, "Duplicate colors");
export const productInput = z.object({
  market: label, shopNumber: label, productNumber: label,
  unitPrice: money.refine(v => Number(v) > 0), sizes, colors,
  moq: z.number().int().min(1).max(100000).default(1),
  leadTime: z.string().trim().max(100).nullable().optional(),
  memo: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().default(true),
}).strict();
export const productPatch = productInput.partial().extend({
  imageIds: z.array(z.uuid()).max(10).refine(v => new Set(v).size === v.length).optional(),
}).strict().refine(v => Object.keys(v).length > 0);
export const listQuery = z.object({
  q: z.string().trim().max(100).default(""), market: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const cartInput = z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(100000), note: z.string().trim().max(2000).default("") }).strict();
export const orderInput = z.object({
  requestKey: z.uuid(), cartItemIds: z.array(z.uuid()).min(1).max(500).refine(v => new Set(v).size === v.length),
  expectedTotal: money, shippingMethod: z.enum(["SEA", "AIR"]),
}).strict();
export type ProductInput = z.infer<typeof productInput>;
export type ProductPatch = z.infer<typeof productPatch>;
export type ListQuery = z.infer<typeof listQuery>;
export type CartInput = z.infer<typeof cartInput>;
export type OrderInput = z.infer<typeof orderInput>;
