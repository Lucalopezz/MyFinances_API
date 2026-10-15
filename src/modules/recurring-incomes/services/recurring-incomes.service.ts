import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { todayKey } from 'src/common/date/civil-date';
import { CategoriesService } from '../../categories/categories.service';
import { incomeEvents } from '../domain/income-occurrences';
import { reviseIncome } from '../domain/income-revisions';
import { RecurringIncomeEncryptionMapper } from '../mappers/recurring-income-encryption.mapper';
import { RecurringIncomesRepository } from '../repositories/recurring-incomes.repository';
import {
  IncomeConfirmation,
  IncomeInput,
  UpdateIncomeInput,
} from '../types/recurring-income.types';

/** Coordena cadastro, revisões e confirmação sem depender dos contratos HTTP. */
@Injectable()
export class RecurringIncomesService {
  constructor(
    private readonly repository: RecurringIncomesRepository,
    private readonly mapper: RecurringIncomeEncryptionMapper,
    private readonly categories: CategoriesService,
  ) {}

  private checkId(id: string) {
    if (!/^[a-f\d]{24}$/i.test(id))
      throw new BadRequestException('Identificador inválido.');
  }

  async list(userId: string) {
    const rows = await this.repository.findByUser(userId);
    return rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      ...this.mapper.revisions(row.encryptedData).at(-1),
    }));
  }

  /** Consulta pública para a agenda: entrega previsões prontas, sem expor criptografia. */
  async occurrences(userId: string, end: string, today: string) {
    const rows = await this.repository.findByUser(userId);
    return rows.flatMap((row) =>
      incomeEvents(
        row.id,
        this.mapper.revisions(row.encryptedData),
        end,
        today,
      ),
    );
  }

  /** Cadastrar uma previsão nunca cria uma transação realizada. */
  async create(userId: string, input: IncomeInput) {
    await this.categories.resolveReference(input.category, userId, 'INCOME');
    const row = await this.repository.create(
      userId,
      this.mapper.encryptRevisions([
        { ...input, effectiveFrom: input.startDate },
      ]),
    );
    return { id: row.id, revision: row.revision, ...input };
  }

  /** A revisão esperada impede que uma edição sobrescreva alterações concorrentes. */
  async update(userId: string, id: string, input: UpdateIncomeInput) {
    this.checkId(id);
    const row = await this.repository.findOwned(id, userId);
    if (!row) throw new NotFoundException('Receita recorrente não encontrada.');
    const revisions = this.mapper.revisions(row.encryptedData);
    const current = revisions.at(-1)!;
    const { revision, ...changes } = input;
    const updated = reviseIncome(revisions, changes, todayKey());
    await this.categories.resolveReference(
      updated.next.category,
      userId,
      'INCOME',
      updated.next.category === current.category,
    );
    const result = await this.repository.updateRevision(
      id,
      userId,
      revision,
      this.mapper.encryptRevisions(updated.revisions),
    );
    if (!result.count)
      throw new ConflictException(
        'A recorrência mudou. Atualize a página e tente novamente.',
      );
    return { id, revision: revision + 1, ...updated.next };
  }

  /**
   * Confirma no máximo uma receita por competência. Repetir a chamada devolve
   * o snapshot original, inclusive após uma mudança do dia previsto.
   */
  async confirm(
    userId: string,
    id: string,
    dueDate: string,
    input: IncomeConfirmation,
  ) {
    this.checkId(id);
    const today = todayKey();
    if (input.date > today)
      throw new BadRequestException(
        'O recebimento deve ter uma data até hoje.',
      );
    const receipt = await this.repository.confirmationTransaction(
      async (tx) => {
        const existing = await this.repository.findReceiptByDue(
          userId,
          id,
          dueDate,
          tx,
        );
        if (existing) return existing;
        const row = await this.repository.findOwned(id, userId, tx);
        if (!row)
          throw new NotFoundException('Receita recorrente não encontrada.');
        if (dueDate > `${Number(today.slice(0, 4)) + 1}-12-31`)
          throw new BadRequestException(
            'Ocorrência fora do horizonte permitido.',
          );
        const event = incomeEvents(
          id,
          this.mapper.revisions(row.encryptedData),
          dueDate,
          today,
        ).find((item) => item.dueDate === dueDate);
        if (!event)
          throw new BadRequestException('Ocorrência inválida ou pausada.');
        const previous = await this.repository.findReceiptByPeriod(
          userId,
          id,
          event.periodKey,
          tx,
        );
        if (previous) return previous;
        await this.categories.resolveReference(
          event.category,
          userId,
          'INCOME',
        );
        return this.repository.recordConfirmation(tx, {
          userId,
          sourceId: id,
          dueDate,
          periodKey: event.periodKey,
          transaction: this.mapper.transaction(userId, event, input),
          snapshot: (transactionId) =>
            this.mapper.settledSnapshot(event, input, transactionId),
        });
      },
    );
    return this.mapper.receipt(receipt.encryptedData);
  }
}
