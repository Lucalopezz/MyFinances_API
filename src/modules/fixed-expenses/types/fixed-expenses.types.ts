import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export type FixedExpenseClient = PrismaService | Prisma.TransactionClient;
export type RecurringExpenseToRefresh = Prisma.FixedExpenseGetPayload<{
  select: {
    id: true;
    dueDate: true;
    recurrence: true;
  };
}>;
export type UpcomingExpenseToNotify = Prisma.FixedExpenseGetPayload<{
  select: {
    id: true;
    name: true;
    amount: true;
    dueDate: true;
    userId: true;
    lastNotificationDueDate: true;
  };
}>;
