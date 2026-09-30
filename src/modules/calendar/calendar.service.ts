import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesService } from '../categories/categories.service';
import { WishlistService } from '../wishlist/wishlist.service';
import {
  buildEncryptedTransactionData,
  decryptTransaction,
  EncryptedTransactionRecord,
} from '../transactions/transaction-encryption.mapper';
import {
  CalendarEvent,
  IncomeInput,
  IncomeRevision,
  updateIncomeSchema,
} from './calendar.dto';
import {
  dailyProjection,
  dayKey,
  dueInMonth,
  incomeEvents,
  nextDay,
  todayKey,
} from './calendar-calculation';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: FinancialDataEncryptionService,
    private readonly categories: CategoriesService,
    private readonly wishlist: WishlistService,
  ) {}
  private revisions(encrypted: string) {
    return this.encryption.decrypt<IncomeRevision[]>(encrypted);
  }
  private checkId(id: string) {
    if (!/^[a-f\d]{24}$/i.test(id))
      throw new BadRequestException('Identificador inválido.');
  }
  async list(userId: string) {
    const rows = await this.prisma.recurringIncome.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      revision: r.revision,
      ...this.revisions(r.encryptedData).at(-1),
    }));
  }
  async create(userId: string, input: IncomeInput) {
    await this.categories.resolveReference(input.category, userId, 'INCOME');
    const row = await this.prisma.recurringIncome.create({
      data: {
        userId,
        encryptedData: this.encryption.encrypt([
          { ...input, effectiveFrom: input.startDate },
        ]),
      },
    });
    return { id: row.id, revision: row.revision, ...input };
  }
  async update(
    userId: string,
    id: string,
    input: z.infer<typeof updateIncomeSchema>,
  ) {
    this.checkId(id);
    const row = await this.prisma.recurringIncome.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Receita recorrente não encontrada.');
    const revisions = this.revisions(row.encryptedData);
    const { revision, ...changes } = input;
    const current = revisions.at(-1)!;
    const next = { ...current, ...changes, effectiveFrom: nextDay(todayKey()) };
    await this.categories.resolveReference(
      next.category,
      userId,
      'INCOME',
      next.category === current.category,
    );
    // Changes affect tomorrow onward. Keep past schedules and receipts intact.
    const updated = [
      ...revisions.filter((v) => v.effectiveFrom < next.effectiveFrom),
      next,
    ];
    const result = await this.prisma.recurringIncome.updateMany({
      where: { id, userId, revision },
      data: {
        encryptedData: this.encryption.encrypt(updated),
        revision: { increment: 1 },
      },
    });
    if (!result.count)
      throw new ConflictException(
        'A recorrência mudou. Atualize a página e tente novamente.',
      );
    return { id, revision: revision + 1, ...next };
  }
  async confirm(
    userId: string,
    id: string,
    dueDate: string,
    input: { amount: number; date: string },
  ) {
    this.checkId(id);
    if (input.date > todayKey())
      throw new BadRequestException(
        'O recebimento deve ter uma data até hoje.',
      );
    const where = {
      userId_sourceId_dueDate: { userId, sourceId: id, dueDate },
    };
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const receipt = await this.prisma.$transaction(async (tx) => {
          const existing = await tx.calendarReceipt.findUnique({ where });
          if (existing) return existing;
          const row = await tx.recurringIncome.findFirst({
            where: { id, userId },
          });
          if (!row)
            throw new NotFoundException('Receita recorrente não encontrada.');
          if (dueDate > `${Number(todayKey().slice(0, 4)) + 1}-12-31`)
            throw new BadRequestException(
              'Ocorrência fora do horizonte permitido.',
            );
          const event = incomeEvents(
            id,
            this.revisions(row.encryptedData),
            dueDate,
            todayKey(),
          ).find((e) => e.dueDate === dueDate);
          if (!event)
            throw new BadRequestException('Ocorrência inválida ou pausada.');
          const previous = await tx.calendarReceipt.findUnique({
            where: {
              userId_sourceId_periodKey: {
                userId,
                sourceId: id,
                periodKey: event.periodKey!,
              },
            },
          });
          if (previous) return previous;
          await this.categories.resolveReference(
            event.category,
            userId,
            'INCOME',
          );
          // Serialize schedule edits and confirmations on the same recurrence.
          await tx.recurringIncome.update({
            where: { id, userId },
            data: { revision: { increment: 1 } },
          });
          const transaction = await tx.transaction.create({
            data: buildEncryptedTransactionData(
              {
                value: input.amount,
                date: new Date(`${input.date}T12:00:00Z`),
                category: event.category,
                description: event.description,
                type: 'INCOME',
                userId,
              },
              this.encryption,
            ) as Prisma.TransactionUncheckedCreateInput,
          });
          const settled: CalendarEvent = {
            ...event,
            status: 'SETTLED',
            actualDate: input.date,
            actualAmount: input.amount,
            transactionId: transaction.id,
          };
          return tx.calendarReceipt.create({
            data: {
              userId,
              sourceId: id,
              dueDate,
              periodKey: event.periodKey!,
              type: 'INCOME',
              transactionId: transaction.id,
              encryptedData: this.encryption.encrypt(settled),
            },
          });
        });
        await this.wishlist.updateWishlistItemsSavings(userId);
        return this.encryption.decrypt<CalendarEvent>(receipt.encryptedData);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code) &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
  }
  async calendar(userId: string, month: string) {
    const today = todayKey();
    const [year, m] = month.split('-').map(Number);
    const delta =
      (year - Number(today.slice(0, 4))) * 12 + m - Number(today.slice(5, 7));
    if (Math.abs(delta) > 12)
      throw new BadRequestException(
        'Consulte até 12 meses antes ou depois do mês atual.',
      );
    const start = `${month}-01`;
    const end = dayKey(new Date(Date.UTC(year, m, 0)));
    const [incomes, expenses, receipts, records] = await Promise.all([
      this.prisma.recurringIncome.findMany({ where: { userId } }),
      this.prisma.fixedExpense.findMany({ where: { userId } }),
      this.prisma.calendarReceipt.findMany({ where: { userId } }),
      this.prisma.transaction.findMany({
        where: { userId, dateIndex: { lte: Number(end.replaceAll('-', '')) } },
      }),
    ]);
    const events = new Map<string, CalendarEvent>();
    for (const income of incomes)
      for (const event of incomeEvents(
        income.id,
        this.revisions(income.encryptedData),
        end,
        today,
      ))
        events.set(event.id, event);
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
        if (dueDate) {
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
            status: settled
              ? 'SETTLED'
              : dueDate < today
                ? 'OVERDUE'
                : 'PENDING',
            ...(settled
              ? {
                  transactionId: expense.paidTransactionId ?? undefined,
                  actualDate: expense.paidAt
                    ? dayKey(expense.paidAt)
                    : undefined,
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
    for (const receipt of receipts) {
      const event = this.encryption.decrypt<CalendarEvent>(
        receipt.encryptedData,
      );
      // A changed due day must not create another forecast for an already settled period.
      for (const [key, pending] of events)
        if (
          pending.sourceId === receipt.sourceId &&
          pending.periodKey === receipt.periodKey
        )
          events.delete(key);
      if (event.dueDate <= end) events.set(event.id, event);
    }
    const all = [...events.values()].sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
    );
    const actual = records
      .map((r) =>
        decryptTransaction(
          r as unknown as EncryptedTransactionRecord,
          this.encryption,
        ),
      )
      .map((t) => ({ date: dayKey(t.date), value: t.value, type: t.type }));
    const projectionStart = month === today.slice(0, 7) ? today : start;
    return {
      month,
      today,
      timezone: 'America/Sao_Paulo',
      events: all.filter((e) => e.dueDate >= start),
      overdue: all.filter(
        (e) => e.dueDate < projectionStart && e.status !== 'SETTLED',
      ),
      projection: dailyProjection(projectionStart, end, all, actual),
    };
  }
}
