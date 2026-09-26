import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  findFixedExpensesDueBefore(userId: string, endExclusive: Date) {
    return this.prisma.fixedExpense.findMany({
      where: { userId, dueDate: { lt: endExclusive } },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        name: true,
        amount: true,
        dueDate: true,
        isPaid: true,
        recurrence: true,
      },
    });
  }
}
