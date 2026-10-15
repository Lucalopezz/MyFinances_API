import { normalizeDescription } from 'src/common/text/normalize-description';

export type CategoryResolutionInput = {
  type: 'INCOME' | 'EXPENSE';
  description: string;
  category?: string;
};
type CategoryTarget = {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  archived: boolean;
};
type ClassificationRule = {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  contains: string;
  enabled: boolean;
};

/** Respeita a ordem de prioridade do catálogo carregado e ignora destinos arquivados. */
export function resolveCategory(
  input: CategoryResolutionInput,
  catalog: readonly CategoryTarget[],
  rules: readonly ClassificationRule[],
) {
  if (input.category) {
    if (
      !catalog.some(
        (item) =>
          item.id === input.category &&
          item.type === input.type &&
          !item.archived,
      )
    )
      return null;
    return {
      category: input.category,
      ruleId: null,
      source: 'manual' as const,
    };
  }
  const description = normalizeDescription(input.description);
  for (const rule of rules) {
    if (
      rule.enabled &&
      rule.type === input.type &&
      catalog.some(
        (item) =>
          item.id === rule.category &&
          item.type === input.type &&
          !item.archived,
      ) &&
      description.includes(rule.contains)
    ) {
      return {
        category: rule.category,
        ruleId: rule.id,
        source: 'rule' as const,
      };
    }
  }
  return { category: null, ruleId: null, source: null };
}
