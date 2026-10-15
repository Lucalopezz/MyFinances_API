import { dayKey } from 'src/common/date/civil-date';
import { dueInMonth } from 'src/common/date/recurrence';
import { fromCents, toCents } from 'src/common/money/money';
import {
  invoiceForPurchase,
  splitInstallments,
} from '../../cards/domain/card-calculation';
import {
  CalendarCard,
  CalendarEvent,
  CalendarExpense,
} from '../types/calendar.types';

/**
 * Compõe compromissos diretos e contratações futuras no cartão.
 * Uma contratação já paga aparece na fatura real e não é prevista novamente.
 */
export function fixedExpenseEvents(
  expenses: CalendarExpense[],
  cards: CalendarCard[],
  month: string,
  end: string,
  today: string,
): CalendarEvent[] {
  const events = new Map<string, CalendarEvent>();
  for (const expense of expenses) {
    const anchor = dayKey(expense.dueDate);
    let cursor = anchor.slice(0, 7);
    while (cursor <= month) {
      const dueDate = dueInMonth(
        anchor,
        cursor,
        expense.recurrence,
        expense.recurrenceDay ?? Number(anchor.slice(8)),
      );
      if (dueDate && expense.cardId) {
        const card = cards.find((item) => item.id === expense.cardId);
        // A contratação registrada já está nas faturas reais. Somar sua
        // despesa fixa novamente duplicaria o impacto na projeção de saldo.
        if (card && !(dueDate === anchor && expense.isPaid)) {
          const count = expense.cardInstallments ?? 1;
          const amounts = splitInstallments(toCents(expense.amount), count);
          amounts.forEach((amount, index) => {
            const scheduled = invoiceForPurchase(
              dueDate,
              card.closingDay,
              card.dueDay,
              index,
            );
            if (scheduled.dueDate <= end) {
              const id = `fixed-card:${expense.id}:${dueDate}:${index}`;
              events.set(id, {
                id,
                sourceId: expense.id,
                dueDate: scheduled.dueDate,
                description: `${expense.name} (${index + 1}/${count}) · contratação prevista no cartão`,
                amount: fromCents(amount),
                category: expense.category,
                type: 'EXPENSE',
                status: scheduled.dueDate < today ? 'OVERDUE' : 'PENDING',
              });
            }
          });
        }
      } else if (dueDate) {
        const settled = dueDate === anchor && expense.isPaid;
        const event: CalendarEvent = {
          id: `${expense.id}:${dueDate}`,
          sourceId: expense.id,
          dueDate,
          periodKey: `${expense.recurrence}:${dueDate.slice(0, expense.recurrence === 'MONTHLY' ? 7 : 4)}`,
          description: expense.name,
          amount: expense.amount,
          category: expense.category,
          type: 'EXPENSE',
          status: settled ? 'SETTLED' : dueDate < today ? 'OVERDUE' : 'PENDING',
          ...(settled
            ? {
                transactionId: expense.paidTransactionId ?? undefined,
                actualDate: expense.paidAt ? dayKey(expense.paidAt) : undefined,
                actualAmount: expense.amount,
              }
            : {}),
        };
        events.set(event.id, event);
      }
      const [cy, cm] = cursor.split('-').map(Number);
      cursor = dayKey(new Date(Date.UTC(cy, cm, 1))).slice(0, 7);
    }
  }
  return [...events.values()];
}
