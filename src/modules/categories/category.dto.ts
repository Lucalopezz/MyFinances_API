import { z } from 'zod';

export const CategoryReferenceSchema = z
  .string()
  .regex(/^(?:[A-Z][A-Z_]{0,39}|[a-f\d]{24})$/, 'Categoria inválida.');
const type = z.enum(['INCOME', 'EXPENSE']);
export const CATEGORY_ICONS = [
  'Briefcase',
  'Car',
  'CircleDollarSign',
  'CircleHelp',
  'CreditCard',
  'Dog',
  'Film',
  'Gift',
  'GraduationCap',
  'HandCoins',
  'Heart',
  'Home',
  'Landmark',
  'Plane',
  'Receipt',
  'Scissors',
  'Shield',
  'ShoppingBag',
  'TrendingUp',
  'Utensils',
  'Tag',
] as const;
export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  type,
  color: z.string().regex(/^#[a-f\d]{6}$/i),
  icon: z.enum(CATEGORY_ICONS),
});
// Type is immutable: changing it would invalidate historical references.
export const UpdateCategorySchema = CreateCategorySchema.omit({ type: true })
  .partial()
  .extend({ archived: z.boolean().optional() })
  .strict();
export const CreateRuleSchema = z.object({
  type,
  contains: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(
      (value) => normalizeDescription(value).length > 0,
      'Informe um texto válido.',
    ),
  category: CategoryReferenceSchema,
  priority: z.number().int().min(0).max(9999),
  enabled: z.boolean(),
});
export const UpdateRuleSchema = CreateRuleSchema.partial();
export const ResolveCategorySchema = z.object({
  type,
  description: z.string().max(2000),
  category: CategoryReferenceSchema.optional(),
});
export const TestRuleSchema = CreateRuleSchema.extend({
  description: z.string().max(2000),
});
export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;
export type CreateRuleDto = z.infer<typeof CreateRuleSchema>;
export type UpdateRuleDto = z.infer<typeof UpdateRuleSchema>;
export type ResolveCategoryDto = z.infer<typeof ResolveCategorySchema>;
export type TestRuleDto = z.infer<typeof TestRuleSchema>;

export function normalizeDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}
