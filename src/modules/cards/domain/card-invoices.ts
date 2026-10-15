import { fromCents } from 'src/common/money/money';
import {
  Card,
  CardSnapshot,
  Installment,
  Payment,
  Purchase,
} from '../types/cards.types';
import {
  annualFeeForCycle,
  closingDateForCycle,
  dueDateForCycle,
} from './card-calculation';

/** Considera a anuidade somente se o ciclo já existia no momento do arquivamento. */
export function invoiceAnnualFee(card: Card, cycle: string) {
  return card.archivedAt &&
    closingDateForCycle(cycle, card.closingDay, card.dueDay) >
      card.archivedAt.toISOString().slice(0, 10)
    ? 0
    : annualFeeForCycle(cycle, card.feeFirstCycle, card.annualFeeCents);
}

/** Monta faturas sem persistir previsões; o horizonte da anuidade mantém o ano seguinte. */
export function buildInvoices(
  card: Card,
  purchases: Purchase[],
  installments: Installment[],
  payments: Payment[],
  today: string,
) {
  const purchaseMap = new Map(purchases.map((row) => [row.id, row]));
  const paymentMap = new Map(payments.map((row) => [row.cycle, row]));
  const cycles = new Set(installments.map((row) => row.cycle));
  const firstYear = Number(card.feeFirstCycle.slice(0, 4));
  if (card.annualFeeCents) {
    for (let year = firstYear; year <= Number(today.slice(0, 4)) + 1; year++) {
      const cycle = `${year}-${card.feeFirstCycle.slice(5)}`;
      if (invoiceAnnualFee(card, cycle)) cycles.add(cycle);
    }
  }
  return [...cycles]
    .sort()
    .map((cycle) => {
      const rows = installments.filter((row) => row.cycle === cycle);
      const lines = rows.map((row) => {
        const purchase = purchaseMap.get(row.purchaseId)!;
        return {
          id: row.id,
          purchaseId: row.purchaseId,
          description: purchase.description,
          category: purchase.category,
          number: row.number,
          installments: purchase.installments,
          amount: fromCents(row.amountCents),
        };
      });
      const annualFeeCents = invoiceAnnualFee(card, cycle);
      const totalCents =
        rows.reduce((sum, row) => sum + row.amountCents, 0) + annualFeeCents;
      const payment = paymentMap.get(cycle);
      return {
        cycle,
        dueDate: dueDateForCycle(cycle, card.dueDay),
        closingDate: closingDateForCycle(cycle, card.closingDay, card.dueDay),
        lines,
        annualFee: fromCents(annualFeeCents),
        total: fromCents(totalCents),
        paid: !!payment,
        transactionIds: payment?.transactionIds ?? [],
        paymentDate: payment?.date ?? null,
        status: payment
          ? 'PAID'
          : dueDateForCycle(cycle, card.dueDay) < today
            ? 'OVERDUE'
            : 'PENDING',
      };
    })
    .filter((invoice) => invoice.total > 0);
}

/** O limite em uso é a maior fatura pendente, sem somar meses diferentes. */
export function buildCardDetail(snapshot: CardSnapshot, today: string) {
  const { card, purchases, installments, payments } = snapshot;
  const invoices = buildInvoices(
    card,
    purchases,
    installments,
    payments,
    today,
  );
  const unpaid = new Set(
    invoices.filter((invoice) => !invoice.paid).map((invoice) => invoice.cycle),
  );
  // Todos os cálculos permanecem em centavos até a conversão do contrato público.
  const usedCents = Math.max(
    0,
    ...[...unpaid].map(
      (cycle) =>
        installments
          .filter((row) => row.cycle === cycle)
          .reduce((sum, row) => sum + row.amountCents, 0) +
        invoiceAnnualFee(card, cycle),
    ),
  );
  return {
    id: card.id,
    archived: !!card.archivedAt,
    name: card.name,
    limit: fromCents(card.limitCents),
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    annualFee: fromCents(card.annualFeeCents),
    used: fromCents(usedCents),
    available: fromCents(card.limitCents - usedCents),
    purchases: purchases.map((row) => ({
      id: row.id,
      date: row.purchaseDate,
      refundedAt: row.refundedAt,
      fixedExpenseId: row.fixedExpenseId,
      description: row.description,
      amount: fromCents(row.amountCents),
      category: row.category,
      installments: row.installments,
    })),
    invoices,
  };
}
