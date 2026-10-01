import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, CategoryRule, TransactionType } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/common/encryption/financial-data-encryption.service';
import { CategoriesRepository } from './categories.repository';
import { CategoryView, DEFAULT_CATEGORIES } from './default-categories';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateRuleDto,
  UpdateRuleDto,
  ResolveCategoryDto,
  TestRuleDto,
  normalizeDescription,
} from './category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly repository: CategoriesRepository,
    private readonly encryption: FinancialDataEncryptionService,
  ) {}

  async list(userId: string): Promise<CategoryView[]> {
    return [
      ...DEFAULT_CATEGORIES,
      ...(await this.repository.list(userId)).map((item) =>
        this.categoryView(item),
      ),
    ];
  }
  async resolveReference(
    id: string,
    userId: string,
    type?: TransactionType,
    allowArchived = false,
  ): Promise<CategoryView> {
    const standard = DEFAULT_CATEGORIES.find((item) => item.id === id);
    const custom =
      !standard && /^[a-f\d]{24}$/.test(id)
        ? await this.repository.find(id, userId)
        : null;
    const category = standard ?? (custom ? this.categoryView(custom) : null);
    if (!category || (type && category.type !== type))
      throw new BadRequestException(
        'Categoria inválida para este usuário ou tipo de movimentação.',
      );
    if (category.archived && !allowArchived)
      throw new BadRequestException(
        'Categoria arquivada. Escolha uma categoria ativa.',
      );
    return category;
  }
  async create(dto: CreateCategoryDto, userId: string) {
    return this.categoryView(
      await this.repository.create({
        type: dto.type,
        color: dto.color,
        icon: dto.icon,
        userId,
        encryptedName: this.encryption.encrypt(dto.name),
      }),
    );
  }
  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    this.checkId(id);
    if (!(await this.repository.find(id, userId)))
      throw new NotFoundException('Categoria não encontrada.');
    const { name, ...data } = dto;
    return this.categoryView(
      await this.repository.update(id, userId, {
        ...data,
        ...(name !== undefined
          ? { encryptedName: this.encryption.encrypt(name) }
          : {}),
      }),
    );
  }
  async listRules(userId: string) {
    return (await this.repository.rules(userId)).map((item) =>
      this.ruleView(item),
    );
  }
  async createRule(dto: CreateRuleDto, userId: string) {
    await this.resolveReference(dto.category, userId, dto.type);
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
    // Disabling a rule must remain possible even after its category was archived.
    const merged = { ...current, ...dto };
    await this.resolveReference(
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
    const category = await this.resolveReference(
      dto.category,
      userId,
      dto.type,
    );
    const matches = normalizeDescription(dto.description).includes(
      normalizeDescription(dto.contains),
    );
    return { matches, category: matches ? category.id : null };
  }
  // Shared by manual suggestions and import preview. Never writes history.
  async resolve(dto: ResolveCategoryDto, userId: string) {
    if (dto.category) {
      await this.resolveReference(dto.category, userId, dto.type);
      return {
        category: dto.category,
        ruleId: null,
        source: 'manual' as const,
      };
    }
    return (await this.createResolver(userId))(dto);
  }
  // Load/decrypt once per import request rather than querying for every row.
  async createResolver(userId: string) {
    const catalog = await this.list(userId);
    const rules = (await this.repository.rules(userId)).map((rule) => ({
      ...rule,
      contains: normalizeDescription(
        this.encryption.decrypt<string>(rule.encryptedContains),
      ),
    }));
    return (dto: ResolveCategoryDto) => {
      if (dto.category) {
        if (
          !catalog.some(
            (item) =>
              item.id === dto.category &&
              item.type === dto.type &&
              !item.archived,
          )
        ) {
          throw new BadRequestException(
            'Categoria inválida, arquivada ou incompatível.',
          );
        }
        return {
          category: dto.category,
          ruleId: null,
          source: 'manual' as const,
        };
      }
      const description = normalizeDescription(dto.description);
      for (const rule of rules) {
        if (
          !rule.enabled ||
          rule.type !== dto.type ||
          !catalog.some(
            (item) =>
              item.id === rule.category &&
              item.type === dto.type &&
              !item.archived,
          )
        )
          continue;
        if (description.includes(rule.contains)) {
          return {
            category: rule.category,
            ruleId: rule.id,
            source: 'rule' as const,
          };
        }
      }
      return { category: null, ruleId: null, source: null };
    };
  }
  private categoryView(item: Category): CategoryView {
    return {
      id: item.id,
      name: this.encryption.decrypt<string>(item.encryptedName),
      type: item.type,
      color: item.color,
      icon: item.icon,
      archived: item.archived,
      isDefault: false,
    };
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
