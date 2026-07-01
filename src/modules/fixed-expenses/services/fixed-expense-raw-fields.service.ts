import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FixedExpenseClient } from '../types/fixed-expenses.types';

@Injectable()
export class FixedExpenseRawFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  // Esse metodo é usado para obter o ID da transação de pagamento de uma despesa fixa, caso ela tenha sido paga.
  // Ele utiliza a função findRaw do Prisma para buscar o campo paidTransactionId no documento
  // da despesa fixa correspondente ao ID fornecido.
  async getPaidTransactionId(id: string) {
    const result = (await this.prisma.fixedExpense.findRaw({
      filter: {
        _id: { $oid: id },
      },
      options: {
        projection: {
          paidTransactionId: 1,
        },
      },
    })) as unknown as Array<{
      paidTransactionId?: string;
    }>;

    return result[0]?.paidTransactionId ?? null;
  }

  // Esse método é usado para definir os campos de pagamento (paidAt e paidTransactionId) de uma despesa fixa.
  // Ele recebe um cliente do Prisma (que pode ser o PrismaService ou um TransactionClient), o ID da despesa fixa,
  // a data de pagamento e o ID da transação de pagamento. Em seguida, ele executa uma operação de atualização
  // no banco de dados para definir os campos correspondentes no documento da despesa fixa.
  async setPaymentFields(
    client: FixedExpenseClient,
    id: string,
    paidAt: Date,
    paidTransactionId: string,
  ) {
    await client.$runCommandRaw({
      update: 'FixedExpense',
      updates: [
        {
          q: { _id: { $oid: id } },
          u: {
            $set: {
              paidAt: { $date: paidAt.toISOString() },
              paidTransactionId,
            },
          },
          multi: false,
        },
      ],
    });
  }

  async clearPaymentFields(client: FixedExpenseClient, id: string) {
    await client.$runCommandRaw({
      update: 'FixedExpense',
      updates: [
        {
          q: { _id: { $oid: id } },
          u: {
            $unset: {
              paidAt: '',
              paidTransactionId: '',
            },
          },
          multi: false,
        },
      ],
    });
  }
}
