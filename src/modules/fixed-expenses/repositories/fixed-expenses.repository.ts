import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { RecurrenceType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
} from '../dtos/fixed-expense.dto';

@Injectable()
export class FixedExpensesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: FinancialDataEncryptionService,
  ) {}

  create(dto: CreateFixedExpenseDto, userId: string) {
    return this.prisma.fixedExpense.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        dueDate: new Date(
          `${new Date(dto.dueDate).toISOString().slice(0, 10)}T12:00:00Z`,
        ),
        recurrence: dto.recurrence,
        recurrenceDay: new Date(dto.dueDate).getUTCDate(),
        isPaid: false,
        lastNotificationDueDate: null,
        userId,
        category: dto.category,
      },
    });
  }

  findManyByUser(userId: string) {
    return this.prisma.fixedExpense.findMany({
      where: { userId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findByIdOrThrow(id: string, userId: string) {
    const expense = await this.prisma.fixedExpense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      throw new NotFoundException(
        `Despesa fixa com ID "${id}" não encontrada.`,
      );
    }

    return expense;
  }

  update(id: string, dto: UpdateFixedExpenseDto) {
    return this.prisma.fixedExpense.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.dueDate !== undefined
          ? {
              dueDate: new Date(
                `${new Date(dto.dueDate).toISOString().slice(0, 10)}T12:00:00Z`,
              ),
              recurrenceDay: new Date(dto.dueDate).getUTCDate(),
            }
          : {}),
        ...(dto.recurrence !== undefined ? { recurrence: dto.recurrence } : {}),
      },
    });
  }

  delete(id: string) {
    return this.prisma.fixedExpense.delete({
      where: { id },
    });
  }

  findRecurringExpensesToRefresh(today: Date, userId?: string) {
    return this.prisma.fixedExpense.findMany({
      where: {
        ...(userId ? { userId } : {}),
        isPaid: true,
        dueDate: { lt: today },
        recurrence: {
          in: [RecurrenceType.MONTHLY, RecurrenceType.YEARLY],
        },
      },
      select: {
        id: true,
        dueDate: true,
        recurrence: true,
        recurrenceDay: true,
      },
    });
  }

  findUpcomingExpensesToNotify(today: Date, deadline: Date, userId?: string) {
    return this.prisma.fixedExpense.findMany({
      where: {
        ...(userId ? { userId } : {}),
        isPaid: false,
        dueDate: {
          gte: today,
          lte: deadline,
        },
      },
      select: {
        id: true,
        name: true,
        amount: true,
        dueDate: true,
        userId: true,
        lastNotificationDueDate: true,
      },
    });
  }

  markNotificationSent(id: string, dueDate: Date) {
    return this.prisma.fixedExpense.update({
      where: { id },
      data: { lastNotificationDueDate: dueDate },
    });
  }

  async refreshCycle(id: string, nextDueDate: Date, expectedDueDate: Date) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.fixedExpense.findUnique({ where: { id } });
      if (
        !expense?.isPaid ||
        expense.dueDate.getTime() !== expectedDueDate.getTime()
      )
        return;
      // Preserve the last legacy paid cycle before advancing it, using its real transaction.
      if (expense.paidTransactionId) {
        const dueDate = expense.dueDate.toISOString().slice(0, 10);
        const periodKey = `${expense.recurrence}:${dueDate.slice(0, expense.recurrence === 'MONTHLY' ? 7 : 4)}`;
        await tx.calendarReceipt.upsert({
          where: {
            userId_sourceId_dueDate: {
              userId: expense.userId,
              sourceId: id,
              dueDate,
            },
          },
          update: {},
          create: {
            userId: expense.userId,
            sourceId: id,
            dueDate,
            periodKey,
            type: 'EXPENSE',
            transactionId: expense.paidTransactionId,
            encryptedData: this.encryption.encrypt({
              id: `${id}:${dueDate}`,
              sourceId: id,
              dueDate,
              periodKey,
              description: expense.name,
              category: expense.category,
              amount: expense.amount,
              type: 'EXPENSE',
              status: 'SETTLED',
              actualDate: expense.paidAt?.toISOString().slice(0, 10),
              actualAmount: expense.amount,
              transactionId: expense.paidTransactionId,
            }),
          },
        });
      }
      return tx.fixedExpense.update({
        where: { id },
        data: {
          dueDate: nextDueDate,
          recurrenceDay: expense.recurrenceDay ?? expense.dueDate.getUTCDate(),
          isPaid: false,
          paidAt: null,
          paidTransactionId: null,
          lastNotificationDueDate: null,
        },
      });
    });
  }
}
