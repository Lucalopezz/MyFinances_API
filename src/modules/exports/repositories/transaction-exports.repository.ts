import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TransactionExportFormat,
  TransactionExportStatus,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TransactionExportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    format: TransactionExportFormat,
    filters?: Prisma.TransactionExportFiltersCreateInput,
  ) {
    return this.prisma.transactionExport.create({
      data: {
        userId,
        status: TransactionExportStatus.PENDING,
        progress: 0,
        format,
        filters,
      },
    });
  }

  findLatest(userId: string) {
    return this.prisma.transactionExport.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  findOwned(id: string, userId: string) {
    return this.prisma.transactionExport.findFirst({ where: { id, userId } });
  }

  markSchedulingFailed(id: string, userId: string) {
    return this.prisma.transactionExport.update({
      where: { id, userId },
      data: {
        status: TransactionExportStatus.FAILED,
        errorMessage: 'Não foi possível agendar a exportação.',
      },
    });
  }

  markProcessing(id: string, userId: string) {
    return this.prisma.transactionExport.update({
      where: { id, userId },
      data: {
        status: TransactionExportStatus.PROCESSING,
        progress: 0,
        errorMessage: null,
        completedAt: null,
        fileName: null,
      },
    });
  }

  updateProgress(id: string, userId: string, progress: number) {
    return this.prisma.transactionExport.update({
      where: { id, userId },
      data: { progress },
    });
  }

  markCompleted(id: string, userId: string, fileName: string) {
    return this.prisma.transactionExport.update({
      where: { id, userId },
      data: {
        status: TransactionExportStatus.COMPLETED,
        progress: 100,
        fileName,
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markFailed(id: string, userId: string) {
    return this.prisma.transactionExport.updateMany({
      where: { id, userId },
      data: {
        status: TransactionExportStatus.FAILED,
        errorMessage: 'Não foi possível gerar o arquivo da exportação.',
        fileName: null,
        completedAt: null,
      },
    });
  }
}
