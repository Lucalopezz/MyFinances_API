import { Injectable, NotFoundException } from '@nestjs/common';
import { todayKey } from 'src/common/date/civil-date';
import { invoiceForPurchase } from '../domain/card-calculation';
import { buildCardDetail } from '../domain/card-invoices';
import { CardEncryptionMapper } from '../mappers/card-encryption.mapper';
import { CardsRepository } from '../repositories/cards.repository';
import { NewCard } from '../types/cards.types';
import { checkCardId } from './card-validation';

/** Coordena cadastro, leitura e arquivamento; cálculos recebem um retrato descriptografado. */
@Injectable()
export class CardsCatalogService {
  constructor(
    private readonly repository: CardsRepository,
    private readonly mapper: CardEncryptionMapper,
  ) {}

  async createCard(userId: string, input: NewCard) {
    const firstCycle = invoiceForPurchase(
      todayKey(),
      input.closingDay,
      input.dueDay,
      0,
    ).cycle;
    const card = await this.repository.createCard(
      userId,
      input.closingDay,
      input.dueDay,
      this.mapper.encryptCard(input, firstCycle),
    );
    return { id: card.id, ...input };
  }

  async listCards(userId: string) {
    const cards = await this.repository.listCards(userId);
    return Promise.all(cards.map((card) => this.detail(userId, card.id)));
  }

  async detail(userId: string, id: string) {
    checkCardId(id);
    const card = await this.repository.findCard(userId, id);
    if (!card) throw new NotFoundException('Cartão não encontrado.');
    const contents = await this.repository.cardContents(userId, id);
    return buildCardDetail(
      {
        card: this.mapper.card(card),
        purchases: contents.purchases.map((row) => this.mapper.purchase(row)),
        installments: contents.installments.map((row) =>
          this.mapper.installment(row),
        ),
        payments: contents.payments.map((row) => this.mapper.payment(row)),
      },
      todayKey(),
    );
  }

  async removeCard(userId: string, id: string) {
    checkCardId(id);
    return this.repository.transaction(async (tx) => {
      const card = await this.repository.findCard(userId, id, tx);
      if (!card) throw new NotFoundException('Cartão não encontrado.');
      if (card.archivedAt) return { message: 'Cartão já arquivado.' };
      await this.repository.claimCard(tx, userId, id, card.revision ?? 0);
      // O arquivamento bloqueia novas compras e preserva as pendências já contratadas.
      await this.repository.archiveCard(tx, userId, id, new Date());
      return { message: 'Cartão removido com sucesso.' };
    });
  }
}
