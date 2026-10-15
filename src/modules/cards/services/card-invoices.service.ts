import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { todayKey } from 'src/common/date/civil-date';
import { toCents } from 'src/common/money/money';
import { settlementItems, validateInvoicePayment } from '../domain/card-rules';
import { CardEncryptionMapper } from '../mappers/card-encryption.mapper';
import { CardsRepository } from '../repositories/cards.repository';
import { CardsCatalogService } from './cards-catalog.service';
import { cardRule, checkCardId } from './card-validation';

/** Liquida faturas integralmente com recibo e despesas na mesma transação MongoDB. */
@Injectable()
export class CardInvoicesService {
  constructor(
    private readonly repository: CardsRepository,
    private readonly mapper: CardEncryptionMapper,
    private readonly catalog: CardsCatalogService,
  ) {}

  /**
   * Converte a fatura fechada em despesas realizadas na data do pagamento.
   * cycle identifica o mês de vencimento; uma fatura já paga é devolvida sem novos lançamentos.
   */
  async payInvoice(userId: string, id: string, cycle: string, date: string) {
    checkCardId(id);
    if (date > todayKey())
      throw new BadRequestException('Pagamento futuro não é permitido.');
    const row = await this.repository.findCard(userId, id);
    if (!row) throw new NotFoundException('Cartão não encontrado.');
    const invoice = (await this.catalog.detail(userId, id)).invoices.find(
      (item) => item.cycle === cycle,
    );
    if (!invoice || !invoice.total)
      throw new NotFoundException('Fatura não encontrada.');
    if (invoice.paid) return invoice;
    const card = this.mapper.card(row);
    cardRule(() => validateInvoicePayment(card, cycle, date, todayKey()));
    try {
      await this.repository.transaction(async (tx) => {
        // A revisão obtida antes da leitura da fatura invalida seu total se outra
        // compra, estorno ou arquivamento venceu a corrida antes do pagamento.
        await this.repository.claimCard(tx, userId, id, card.revision);
        if (await this.repository.findPayment(tx, userId, id, cycle)) return;
        const contents = await this.repository.invoiceContents(
          tx,
          userId,
          id,
          cycle,
        );
        const items = settlementItems(
          contents.installments.map((entry) => this.mapper.installment(entry)),
          contents.purchases.map((entry) => this.mapper.purchase(entry)),
          toCents(invoice.annualFee),
        );
        const transactionIds: string[] = [];
        // Cada parcela vira uma despesa com a categoria original da compra.
        // Somar tudo em uma despesa única perderia o detalhamento dos indicadores.
        for (const item of items) {
          const transaction = await this.repository.createTransaction(
            tx,
            this.mapper.transaction(userId, 'EXPENSE', date, {
              ...item,
              description: `Cartão ${card.name}: ${item.description}`,
            }),
          );
          transactionIds.push(transaction.id);
        }
        // O recibo vincula todas as despesas ao mesmo pagamento. Como ele é gravado
        // no mesmo tx, uma falha também desfaz os lançamentos criados acima.
        await this.repository.createPayment(
          tx,
          userId,
          id,
          cycle,
          transactionIds,
          this.mapper.encryptPayment(
            date,
            items.reduce((sum, item) => sum + item.amountCents, 0),
          ),
        );
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('Fatura já paga. Atualize a página.');
      throw error;
    }
    return (await this.catalog.detail(userId, id)).invoices.find(
      (item) => item.cycle === cycle,
    );
  }
}
