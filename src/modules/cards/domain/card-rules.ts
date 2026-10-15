import { toCents } from 'src/common/money/money';
import {
  Card,
  Installment,
  NewPurchase,
  Payment,
  Purchase,
  ScheduledInstallment,
  SettlementItem,
} from '../types/cards.types';
import {
  annualFeeForCycle,
  closingDateForCycle,
  invoiceForPurchase,
  splitInstallments,
} from './card-calculation';

/** Violação financeira independente de HTTP; a aplicação traduz para sua resposta. */
export class CardRuleViolation extends Error {}

/** Valida a entrada antes de consultar/gravar, usando o dia civil informado. */
export function validatePurchase(input: NewPurchase, today: string) {
  if (input.date > today)
    throw new CardRuleViolation('A compra não pode estar no futuro.');
  if (toCents(input.amount) < input.installments)
    throw new CardRuleViolation(
      'O valor deve permitir parcelas de pelo menos um centavo.',
    );
}

/** Rateia a compra e verifica cada fatura, incluindo parcelas existentes e anuidade. */
export function planPurchase(
  card: Card,
  input: NewPurchase,
  existing: Installment[],
  payments: Payment[],
): ScheduledInstallment[] {
  const paidCycles = new Set(payments.map((payment) => payment.cycle));
  const schedule = splitInstallments(
    toCents(input.amount),
    input.installments,
  ).map((amount, index) => ({
    amount,
    ...invoiceForPurchase(input.date, card.closingDay, card.dueDay, index),
  }));
  if (schedule.some((entry) => paidCycles.has(entry.cycle)))
    throw new CardRuleViolation(
      'A compra pertence a uma fatura já paga. Escolha uma data válida.',
    );
  // O limite é por competência: somar a compra inteira recusaria parcelamentos válidos.
  for (const entry of schedule) {
    const committed = existing
      .filter((row) => row.cycle === entry.cycle && !paidCycles.has(row.cycle))
      .reduce((sum, row) => sum + row.amountCents, 0);
    const fee = annualFeeForCycle(
      entry.cycle,
      card.feeFirstCycle,
      card.annualFeeCents,
    );
    if (committed + fee + entry.amount > card.limitCents)
      throw new CardRuleViolation(
        `Limite insuficiente na fatura de ${entry.cycle.slice(5)}/${entry.cycle.slice(0, 4)}. Reduza o valor ou ajuste as parcelas.`,
      );
  }
  return schedule;
}

/** Faturas abertas e pagamentos anteriores ao fechamento não geram despesas realizadas. */
export function validateInvoicePayment(
  card: Card,
  cycle: string,
  date: string,
  today: string,
) {
  const closingDate = closingDateForCycle(cycle, card.closingDay, card.dueDay);
  if (closingDate > today)
    throw new CardRuleViolation('A fatura ainda está aberta.');
  if (date < closingDate)
    throw new CardRuleViolation(
      'O pagamento não pode ser anterior ao fechamento.',
    );
}

/** Mantém categoria e valor de cada parcela; anuidade sempre usa a categoria OTHER. */
export function settlementItems(
  installments: Installment[],
  purchases: Purchase[],
  annualFeeCents: number,
): SettlementItem[] {
  const byId = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  const items = installments.map((row) => {
    const purchase = byId.get(row.purchaseId)!;
    return {
      amountCents: row.amountCents,
      category: purchase.category,
      description: `${purchase.description} (${row.number}/${purchase.installments})`,
    };
  });
  if (annualFeeCents)
    items.push({
      amountCents: annualFeeCents,
      category: 'OTHER',
      description: 'Anuidade do cartão',
    });
  return items;
}

/** Estorno devolve somente parcelas efetivamente liquidadas, sem antecipar crédito futuro. */
export function paidRefundCents(
  installments: Installment[],
  payments: Payment[],
) {
  const paid = new Set(payments.map((payment) => payment.cycle));
  return installments
    .filter((row) => paid.has(row.cycle))
    .reduce((sum, row) => sum + row.amountCents, 0);
}
