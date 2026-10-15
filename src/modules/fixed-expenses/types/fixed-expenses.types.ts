import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';

export type FixedExpenseClient = PrismaService | Prisma.TransactionClient;
export type RecurringExpenseToRefresh = Prisma.FixedExpenseGetPayload<{
  select: {
    id: true;
    dueDate: true;
    recurrence: true;
    recurrenceDay: true;
  };
}>;
