import { CalendarCard, CalendarEvent } from '../types/calendar.types';

/** Faturas pagas são snapshots realizados; apenas as pendentes impactam as previsões. */
export function cardInvoiceEvents(
  cards: CalendarCard[],
  end: string,
  today: string,
): CalendarEvent[] {
  const events = new Map<string, CalendarEvent>();
  for (const card of cards)
    for (const invoice of card.invoices) {
      if (invoice.dueDate > end) continue;
      events.set(`card:${card.id}:${invoice.cycle}`, {
        id: `card:${card.id}:${invoice.cycle}`,
        sourceId: card.id,
        dueDate: invoice.dueDate,
        description: `Fatura ${card.name}`,
        amount: invoice.total,
        category: 'OTHER',
        type: 'EXPENSE',
        status: invoice.paid
          ? 'SETTLED'
          : invoice.dueDate < today
            ? 'OVERDUE'
            : 'PENDING',
        ...(invoice.paid
          ? {
              actualDate: invoice.paymentDate ?? undefined,
              actualAmount: invoice.total,
            }
          : {}),
      });
    }
  return [...events.values()];
}
