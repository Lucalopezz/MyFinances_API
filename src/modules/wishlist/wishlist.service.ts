import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WishlistItem, WishlistMovement } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesService } from '../categories/categories.service';
import {
  buildEncryptedTransactionData,
  decryptTransaction,
  decryptTransactions,
  EncryptedTransactionRecord,
} from '../transactions/transaction-encryption.mapper';
import {
  CompleteWishlistItemDto,
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
  WishlistMovementDto,
} from './dtos/wishlist.dto';

type MovementKind = 'DEPOSIT' | 'WITHDRAWAL' | 'CONSUMPTION' | 'RELEASE';
const cents = (value: number) => Math.round(value * 100);
const amount = (value: number) => value / 100;

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: FinancialDataEncryptionService,
    private readonly categories: CategoriesService,
  ) {}

  // Deprecated compatibility hook for older callers; production flows do not invoke it.
  async updateWishlistItemsSavings(_userId: string): Promise<void> {}

  private movementView(movement: WishlistMovement) {
    const data = movement.encryptedData as {
      value: string;
      date: string;
      note: string;
    };
    return {
      id: movement.id,
      kind: movement.kind as MovementKind,
      value: this.encryption.decrypt<number>(data.value),
      date: this.encryption.decrypt<string>(data.date),
      note: this.encryption.decrypt<string | null>(data.note),
      createdAt: movement.createdAt,
    };
  }

  private movementData(value: number, date: string, note?: string | null) {
    return {
      value: this.encryption.encrypt(value),
      date: this.encryption.encrypt(date),
      note: this.encryption.encrypt(note ?? null),
    };
  }

  private itemView(item: WishlistItem, movements: WishlistMovement[]) {
    const history = movements.map((movement) => this.movementView(movement));
    const reservedCents = history.reduce(
      (total, movement) =>
        total +
        (movement.kind === 'DEPOSIT'
          ? cents(movement.value)
          : -cents(movement.value)),
      0,
    );
    const reserved = amount(reservedCents);
    const remainingCents = Math.max(
      0,
      cents(item.desiredValue) - reservedCents,
    );
    const target = item.targetDate?.toISOString().slice(0, 10) ?? null;
    const today = new Date().toISOString().slice(0, 10);
    let monthlySuggestion: number | null = null;
    let deadlineState: 'NONE' | 'ON_TRACK' | 'OVERDUE' | 'REACHED' = 'NONE';
    if (remainingCents === 0) deadlineState = 'REACHED';
    else if (target && target < today) deadlineState = 'OVERDUE';
    else if (target) {
      const [year, month] = target.split('-').map(Number);
      const [currentYear, currentMonth] = today.split('-').map(Number);
      const months = (year - currentYear) * 12 + month - currentMonth + 1;
      monthlySuggestion = amount(Math.ceil(remainingCents / months));
      deadlineState = 'ON_TRACK';
    }
    return {
      id: item.id,
      name: item.name,
      desiredValue: item.desiredValue,
      targetDate: target,
      reservedAmount: reserved,
      remainingAmount: amount(remainingCents),
      progressPercent: Math.min(
        100,
        Math.round((reservedCents / cents(item.desiredValue)) * 100),
      ),
      monthlySuggestion,
      deadlineState,
      legacySavedAmount: item.savedAmount,
      reservationMigrationState: item.reservationMigrationState ?? 'PENDING',
      status: item.status ?? 'ACTIVE',
      completedAt: item.completedAt,
      purchaseTransactionId: item.purchaseTransactionId,
      movements: history,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private async findOwned(
    id: string,
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const item = await tx.wishlistItem.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Meta não encontrada.');
    return item;
  }

  private async view(
    item: WishlistItem,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const movements = await tx.wishlistMovement.findMany({
      where: { userId: item.userId, wishlistItemId: item.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return this.itemView(item, movements);
  }

  private async summaryFor(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const [transactions, items, movements] = await Promise.all([
      tx.transaction.findMany({ where: { userId } }),
      tx.wishlistItem.findMany({ where: { userId } }),
      tx.wishlistMovement.findMany({ where: { userId } }),
    ]);
    const financialCents = decryptTransactions(
      transactions as unknown as EncryptedTransactionRecord[],
      this.encryption,
    ).reduce(
      (sum, transaction) =>
        sum +
        (transaction.type === 'INCOME'
          ? cents(transaction.value)
          : -cents(transaction.value)),
      0,
    );
    const activeIds = new Set(
      items
        .filter((item) => (item.status ?? 'ACTIVE') === 'ACTIVE')
        .map((item) => item.id),
    );
    const reservedCents = movements
      .filter((movement) => activeIds.has(movement.wishlistItemId))
      .reduce((sum, movement) => {
        const value = cents(this.movementView(movement).value);
        return sum + (movement.kind === 'DEPOSIT' ? value : -value);
      }, 0);
    return {
      financialBalance: amount(financialCents),
      totalReserved: amount(reservedCents),
      freeBalance: amount(financialCents - reservedCents),
      insufficient: financialCents < reservedCents,
    };
  }

  async getSummary(userId: string) {
    return this.summaryFor(userId);
  }

  async createWishlistItem(dto: CreateWishlistItemDto, userId: string) {
    const item = await this.prisma.wishlistItem.create({
      data: {
        name: dto.name,
        desiredValue: dto.desiredValue,
        targetDate: dto.targetDate
          ? new Date(`${dto.targetDate}T00:00:00.000Z`)
          : null,
        userId,
        savedAmount: 0,
        reservationMigrationState: 'SETTLED',
        status: 'ACTIVE',
      },
    });
    return this.view(item);
  }

  async getWishlistItems(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const movements = await this.prisma.wishlistMovement.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return items.map((item) =>
      this.itemView(
        item,
        movements.filter((movement) => movement.wishlistItemId === item.id),
      ),
    );
  }

  async getWishlistItem(id: string, userId: string) {
    return this.view(await this.findOwned(id, userId));
  }

  async updateWishlistItem(
    id: string,
    dto: UpdateWishlistItemDto,
    userId: string,
  ) {
    return this.atomic(userId, async (tx) => {
      const item = await this.findOwned(id, userId, tx);
      if ((item.status ?? 'ACTIVE') !== 'ACTIVE')
        throw new ConflictException('A compra concluída não pode ser editada.');
      return this.view(
        await tx.wishlistItem.update({
          where: { id, userId },
          data: {
            ...dto,
            targetDate:
              dto.targetDate === undefined
                ? undefined
                : dto.targetDate
                  ? new Date(`${dto.targetDate}T00:00:00.000Z`)
                  : null,
          },
        }),
        tx,
      );
    });
  }

  private async atomic<T>(
    userId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // One write per user serializes competing reservation and completion requests.
            await tx.user.update({
              where: { id: userId },
              data: { reservationRevision: { increment: 1 } },
            });
            return operation(tx);
          },
          { maxWait: 5000, timeout: 20000 },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException(
      'Conflito ao atualizar reservas. Tente novamente.',
    );
  }

  async addMovement(id: string, dto: WishlistMovementDto, userId: string) {
    return this.atomic(userId, async (tx) => {
      const item = await this.findOwned(id, userId, tx);
      if ((item.status ?? 'ACTIVE') !== 'ACTIVE')
        throw new ConflictException('Meta já concluída.');
      const current = await this.view(item, tx);
      if (
        dto.kind === 'WITHDRAWAL' &&
        cents(dto.value) > cents(current.reservedAmount)
      )
        throw new BadRequestException('Retirada maior que a reserva da meta.');
      if (dto.kind === 'DEPOSIT') {
        const summary = await this.summaryFor(userId, tx);
        if (cents(dto.value) > cents(summary.freeBalance))
          throw new BadRequestException(
            'Saldo livre insuficiente para este aporte.',
          );
      }
      await tx.wishlistMovement.create({
        data: {
          userId,
          wishlistItemId: id,
          kind: dto.kind,
          encryptedData: this.movementData(dto.value, dto.date, dto.note),
        },
      });
      return this.view(item, tx);
    });
  }

  async settleMigration(userId: string) {
    await this.prisma.wishlistItem.updateMany({
      where: { userId },
      data: { reservationMigrationState: 'SETTLED' },
    });
    return this.getWishlistItems(userId);
  }

  async complete(id: string, dto: CompleteWishlistItemDto, userId: string) {
    return this.atomic(userId, async (tx) => {
      const item = await this.findOwned(id, userId, tx);
      if ((item.status ?? 'ACTIVE') === 'COMPLETED') {
        if (!item.purchaseTransactionId)
          throw new ConflictException(
            'Compra concluída sem transação vinculada.',
          );
        const transaction = await tx.transaction.findFirst({
          where: { id: item.purchaseTransactionId, userId },
        });
        if (!transaction)
          throw new ConflictException(
            'Compra concluída sem transação vinculada.',
          );
        const view = await this.view(item, tx);
        const purchase = decryptTransaction(
          transaction as unknown as EncryptedTransactionRecord,
          this.encryption,
        );
        const coveredAmount = amount(
          view.movements
            .filter((movement) => movement.kind === 'CONSUMPTION')
            .reduce((sum, movement) => sum + cents(movement.value), 0),
        );
        const releasedAmount = amount(
          view.movements
            .filter((movement) => movement.kind === 'RELEASE')
            .reduce((sum, movement) => sum + cents(movement.value), 0),
        );
        return {
          item: view,
          transaction: purchase,
          coveredAmount,
          releasedAmount,
          uncoveredAmount: amount(cents(purchase.value) - cents(coveredAmount)),
          alreadyCompleted: true,
        };
      }
      if ((item.status ?? 'ACTIVE') !== 'ACTIVE')
        throw new ConflictException('Meta indisponível para conclusão.');
      await this.categories.resolveReference(dto.category, userId, 'EXPENSE');
      const current = await this.view(item, tx);
      const purchaseDate = new Date(`${dto.date}T00:00:00.000Z`);
      const transaction = await tx.transaction.create({
        data: buildEncryptedTransactionData(
          {
            value: dto.value,
            date: purchaseDate,
            category: dto.category,
            description: dto.description,
            type: 'EXPENSE',
            userId,
          },
          this.encryption,
        ) as never,
      });
      const used = Math.min(cents(current.reservedAmount), cents(dto.value));
      const released = cents(current.reservedAmount) - used;
      if (used > 0)
        await tx.wishlistMovement.create({
          data: {
            userId,
            wishlistItemId: id,
            kind: 'CONSUMPTION',
            encryptedData: this.movementData(
              amount(used),
              dto.date,
              'Reserva usada na compra',
            ),
          },
        });
      if (released > 0)
        await tx.wishlistMovement.create({
          data: {
            userId,
            wishlistItemId: id,
            kind: 'RELEASE',
            encryptedData: this.movementData(
              amount(released),
              dto.date,
              'Sobra liberada após compra',
            ),
          },
        });
      const completed = await tx.wishlistItem.update({
        where: { id, userId },
        data: {
          status: 'COMPLETED',
          completedAt: purchaseDate,
          purchaseTransactionId: transaction.id,
        },
      });
      return {
        item: await this.view(completed, tx),
        transaction: decryptTransaction(
          transaction as unknown as EncryptedTransactionRecord,
          this.encryption,
        ),
        coveredAmount: amount(used),
        releasedAmount: amount(released),
        uncoveredAmount: amount(cents(dto.value) - used),
        alreadyCompleted: false,
      };
    });
  }

  async deleteWishlistItem(id: string, userId: string) {
    return this.atomic(userId, async (tx) => {
      const item = await this.findOwned(id, userId, tx);
      if ((item.status ?? 'ACTIVE') !== 'ACTIVE')
        throw new ConflictException(
          'Compra concluída deve permanecer no histórico.',
        );
      await tx.wishlistMovement.deleteMany({
        where: { userId, wishlistItemId: id },
      });
      await tx.wishlistItem.delete({ where: { id, userId } });
      return { deleted: true };
    });
  }
}
