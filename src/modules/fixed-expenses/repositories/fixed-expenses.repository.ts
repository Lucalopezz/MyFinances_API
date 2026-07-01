import { Injectable, NotFoundException } from '@nestjs/common';
import { RecurrenceType } from '@prisma/client';
import { startOfDay } from 'date-fns';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
} from '../dtos/fixed-expense.dto';

@Injectable()
export class FixedExpensesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateFixedExpenseDto, userId: string) {
    return this.prisma.fixedExpense.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        dueDate: startOfDay(new Date(dto.dueDate)),
        recurrence: dto.recurrence,
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
          ? { dueDate: startOfDay(new Date(dto.dueDate)) }
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
}
