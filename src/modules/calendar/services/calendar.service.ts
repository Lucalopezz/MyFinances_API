import { BadRequestException, Injectable } from '@nestjs/common';
import { dayKey, todayKey } from 'src/common/date/civil-date';
import { CardsService } from '../../cards/cards.service';
import { RecurringIncomesService } from '../../recurring-incomes/services/recurring-incomes.service';
import { TransactionQueriesService } from '../../transactions/services/transaction-queries.service';
import { calendarEvents } from '../domain/calendar-events';
import { calendarPeriod } from '../domain/calendar-period';
import { cardInvoiceEvents } from '../domain/card-invoice-events';
import { dailyProjection } from '../domain/daily-projection';
import { fixedExpenseEvents } from '../domain/fixed-expense-events';
import { CalendarReceiptMapper } from '../mappers/calendar-receipt.mapper';
import { CalendarRepository } from '../repositories/calendar.repository';

/** Compõe agenda e projeção sem assumir as operações dos módulos de origem. */
@Injectable()
export class CalendarService {
  constructor(
    private readonly repository: CalendarRepository,
    private readonly receipts: CalendarReceiptMapper,
    private readonly incomes: RecurringIncomesService,
    private readonly cards: CardsService,
    private readonly transactions: TransactionQueriesService,
  ) {}

  /**
   * Consulta previsões e realizados em paralelo. O histórico completo anterior ao
   * fim do mês mantém o saldo acumulado; nenhuma leitura confirma ocorrências.
   */
  async calendar(userId: string, month: string) {
    const today = todayKey();
    const period = calendarPeriod(month, today);
    if (!period.withinHorizon)
      throw new BadRequestException(
        'Consulte até 12 meses antes ou depois do mês atual.',
      );
    const [incomes, expenses, receipts, actuals, cards] = await Promise.all([
      this.incomes.occurrences(userId, period.end, today),
      this.repository.findExpenses(userId),
      this.repository.findReceipts(userId),
      this.transactions.findThroughDate(
        userId,
        new Date(`${period.end}T12:00:00Z`),
      ),
      this.cards.listCards(userId),
    ]);
    const all = calendarEvents(
      [
        ...incomes,
        ...fixedExpenseEvents(expenses, cards, month, period.end, today),
      ],
      receipts.map((receipt) => this.receipts.snapshot(receipt)),
      cardInvoiceEvents(cards, period.end, today),
      period.end,
    );
    const actual = actuals.map((entry) => ({
      date: dayKey(entry.date),
      value: entry.value,
      type: entry.type,
    }));
    return {
      month,
      today,
      timezone: 'America/Sao_Paulo',
      events: all.filter((event) => event.dueDate >= period.start),
      overdue: all.filter(
        (event) =>
          event.dueDate < period.projectionStart && event.status !== 'SETTLED',
      ),
      projection: dailyProjection(
        period.projectionStart,
        period.end,
        all,
        actual,
      ),
    };
  }
}
