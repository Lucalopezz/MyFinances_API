import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';

/** Leituras da agenda não avançam ciclos nem alteram os registros financeiros. */
@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  findExpenses(userId: string) {
    return this.prisma.fixedExpense.findMany({ where: { userId } });
  }

  /** Inclui despesas e receitas: os dois domínios mantêm o mesmo histórico durável. */
  findReceipts(userId: string) {
    return this.prisma.calendarReceipt.findMany({ where: { userId } });
  }
}
