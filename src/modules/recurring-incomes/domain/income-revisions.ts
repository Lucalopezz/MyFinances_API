import { nextDay } from 'src/common/date/civil-date';
import { IncomeRevision, IncomeInput } from '../types/recurring-income.types';

/**
 * Edições passam a valer amanhã, preservando previsões passadas e períodos pausados.
 * Mais de uma edição no mesmo dia substitui somente a revisão ainda futura.
 */
export function reviseIncome(
  revisions: IncomeRevision[],
  changes: Partial<IncomeInput>,
  today: string,
) {
  const next: IncomeRevision = {
    ...revisions.at(-1)!,
    ...changes,
    effectiveFrom: nextDay(today),
  };
  return {
    next,
    revisions: [
      ...revisions.filter((item) => item.effectiveFrom < next.effectiveFrom),
      next,
    ],
  };
}
