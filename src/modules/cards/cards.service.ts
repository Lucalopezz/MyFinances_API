import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CardInvoicesService } from './services/card-invoices.service';
import { CardPurchasesService } from './services/card-purchases.service';
import { CardsCatalogService } from './services/cards-catalog.service';
import { NewCard, NewPurchase } from './types/cards.types';

/** API pública do módulo: consumidores conhecem operações, sem acessar persistência ou criptografia. */
@Injectable()
export class CardsService {
  constructor(
    private readonly catalog: CardsCatalogService,
    private readonly purchases: CardPurchasesService,
    private readonly invoices: CardInvoicesService,
  ) {}

  createCard(userId: string, input: NewCard) {
    return this.catalog.createCard(userId, input);
  }
  listCards(userId: string) {
    return this.catalog.listCards(userId);
  }
  detail(userId: string, id: string) {
    return this.catalog.detail(userId, id);
  }
  removeCard(userId: string, id: string) {
    return this.catalog.removeCard(userId, id);
  }
  createPurchase(
    userId: string,
    id: string,
    input: NewPurchase,
    client?: Prisma.TransactionClient,
  ) {
    return this.purchases.createPurchase(userId, id, input, client);
  }
  refundPurchase(userId: string, id: string, purchaseId: string) {
    return this.purchases.refundPurchase(userId, id, purchaseId);
  }
  payInvoice(userId: string, id: string, cycle: string, date: string) {
    return this.invoices.payInvoice(userId, id, cycle, date);
  }
}
