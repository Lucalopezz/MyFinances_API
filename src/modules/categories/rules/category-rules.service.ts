import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoryRule } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { CategoriesRepository } from '../repositories/categories.repository';
import { CategoriesService } from '../categories.service';
import { CreateRuleDto, UpdateRuleDto, TestRuleDto } from '../dto/category.dto';
import { normalizeDescription } from 'src/common/text/normalize-description';

/** Gerencia regras de classificação sem alterar o catálogo nem o histórico financeiro. */
@Injectable()
export class CategoryRulesService {
  constructor(
    private readonly repository: CategoriesRepository,
    private readonly encryption: FinancialDataEncryptionService,
    private readonly categories: CategoriesService,
  ) {}
  async listRules(userId: string) {
    return (await this.repository.rules(userId)).map((item) =>
      this.ruleView(item),
    );
  }
  async createRule(dto: CreateRuleDto, userId: string) {
    await this.categories.resolveReference(dto.category, userId, dto.type);
    return this.ruleView(
      await this.repository.createRule({
        type: dto.type,
        category: dto.category,
        priority: dto.priority,
        enabled: dto.enabled,
        userId,
        encryptedContains: this.encryption.encrypt(dto.contains),
      }),
    );
  }
  async updateRule(id: string, dto: UpdateRuleDto, userId: string) {
    const current = await this.ownedRule(id, userId);
    // Deve ser possível desativar uma regra mesmo depois de sua categoria ser arquivada.
    const merged = { ...current, ...dto };
    await this.categories.resolveReference(
      merged.category,
      userId,
      merged.type,
      !merged.enabled && !dto.category && !dto.type,
    );
    const { contains, ...data } = dto;
    return this.ruleView(
      await this.repository.updateRule(id, userId, {
        ...data,
        ...(contains !== undefined
          ? { encryptedContains: this.encryption.encrypt(contains) }
          : {}),
      }),
    );
  }
  async removeRule(id: string, userId: string) {
    await this.ownedRule(id, userId);
    await this.repository.removeRule(id, userId);
    return { message: 'Regra removida.' };
  }
  async testRule(dto: TestRuleDto, userId: string) {
    const category = await this.categories.resolveReference(
      dto.category,
      userId,
      dto.type,
    );
    const matches = normalizeDescription(dto.description).includes(
      normalizeDescription(dto.contains),
    );
    return { matches, category: matches ? category.id : null };
  }
  private ruleView(item: CategoryRule) {
    return {
      id: item.id,
      type: item.type,
      category: item.category,
      contains: this.encryption.decrypt<string>(item.encryptedContains),
      priority: item.priority,
      enabled: item.enabled,
    };
  }
  private checkId(id: string) {
    if (!/^[a-f\d]{24}$/.test(id))
      throw new NotFoundException('Registro não encontrado.');
  }
  private async ownedRule(id: string, userId: string) {
    this.checkId(id);
    const rule = await this.repository.findRule(id, userId);
    if (!rule) throw new NotFoundException('Regra não encontrada.');
    return rule;
  }
}
