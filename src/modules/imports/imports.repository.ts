import { GoneException, Injectable } from '@nestjs/common';
import { Prisma, TransactionImportResult } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export type LineResult = Pick<
  TransactionImportResult,
  'rowId' | 'status' | 'reason' | 'transactionId'
>;

@Injectable()
export class ImportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    encryptedData: string,
    expiresAt: Date,
    rowCount: number,
  ) {
    return this.prisma.transactionImport.create({
      data: { userId, encryptedData, expiresAt, rowCount },
    });
  }
  find(id: string, userId: string) {
    return this.prisma.transactionImport.findFirst({ where: { id, userId } });
  }
  results(batchId: string, userId: string) {
    return this.prisma.transactionImportResult.findMany({
      where: { batchId, userId },
      orderBy: { rowId: 'asc' },
    });
  }
  cancel(id: string, userId: string) {
    return this.prisma.transactionImport.update({
      where: { id, userId },
      data: { encryptedData: null, expiresAt: new Date() },
    });
  }
  purgeExpired() {
    return this.prisma.transactionImport.updateMany({
      where: { expiresAt: { lte: new Date() }, encryptedData: { not: null } },
      data: { encryptedData: null },
    });
  }

  // A receipt and its encrypted transaction commit together. The compound unique
  // index plus MongoDB transaction retries make simultaneous confirmations safe.
  async saveResult(
    batchId: string,
    userId: string,
    result: LineResult,
    transaction?: Record<string, unknown>,
  ): Promise<LineResult> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const key = { userId, batchId, rowId: result.rowId };
          const existing = await tx.transactionImportResult.findUnique({
            where: { userId_batchId_rowId: key },
          });
          if (existing?.status === 'IMPORTED') return existing;
          const batch = await tx.transactionImport.findFirst({
            where: { id: batchId, userId },
          });
          if (!batch?.encryptedData || batch.expiresAt <= new Date())
            throw new GoneException('Prévia expirada ou cancelada.');
          // Serializes cancellation/expiry with writes, including across API instances.
          await tx.transactionImport.update({
            where: { id: batchId, userId },
            data: { revision: { increment: 1 } },
          });
          const created = transaction
            ? await tx.transaction.create({
                data: transaction as Prisma.TransactionUncheckedCreateInput,
              })
            : null;
          const data = { ...result, transactionId: created?.id ?? null };
          return tx.transactionImportResult.upsert({
            where: { userId_batchId_rowId: key },
            create: { ...key, ...data },
            update: data,
          });
        });
      } catch (error) {
        if (attempt < 3 && (error.code === 'P2034' || error.code === 'P2002'))
          continue;
        throw error;
      }
    }
  }
}
