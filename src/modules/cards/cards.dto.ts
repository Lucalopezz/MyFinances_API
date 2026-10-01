import { z } from 'zod';
import { dateSchema } from '../calendar/calendar.dto';
import { CategoryReferenceSchema } from '../categories/category.dto';

const money = z.number().finite().positive().max(999999999).multipleOf(0.01);
export const cardSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    limit: money,
    closingDay: z.number().int().min(1).max(31),
    dueDay: z.number().int().min(1).max(31),
    annualFee: money.or(z.literal(0)).default(0),
  })
  .refine((value) => value.annualFee <= value.limit, {
    path: ['annualFee'],
    message: 'A anuidade não pode exceder o limite.',
  });
export const purchaseSchema = z.object({
  description: z.string().trim().min(1).max(120),
  amount: money,
  date: dateSchema,
  category: CategoryReferenceSchema,
  installments: z.number().int().min(1).max(60),
});
export const paymentSchema = z.object({ date: dateSchema });
export const cycleSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export type CardInput = z.infer<typeof cardSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
