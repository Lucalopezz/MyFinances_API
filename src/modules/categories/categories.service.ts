import { normalizeDescription } from 'src/common/text/normalize-description';
import { resolveCategory } from './rules/domain/category-resolution';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, TransactionType } from '@prisma/client';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';
import { CategoriesRepository } from './repositories/categories.repository';
import { CategoryView, DEFAULT_CATEGORIES } from './domain/default-categories';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ResolveCategoryDto,
} from './dto/category.dto';

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
  // Compartilhado pelas sugestões manuais e pela prévia de importação, sem gravar no histórico.
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
  // Carrega e descriptografa uma vez por solicitação de importação, evitando consultas por linha.
  async createResolver(userId: string) {
    const catalog = await this.list(userId);
    const rules = (await this.repository.rules(userId)).map((rule) => ({
      ...rule,
      contains: normalizeDescription(
        this.encryption.decrypt<string>(rule.encryptedContains),
      ),
    }));
    return (dto: ResolveCategoryDto) => {
      const result = resolveCategory(
        {
          type: dto.type,
          description: dto.description,
          category: dto.category,
        },
        catalog,
        rules,
      );
      if (!result)
        throw new BadRequestException(
          'Categoria inválida, arquivada ou incompatível.',
        );
      return result;
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
  private checkId(id: string) {
    if (!/^[a-f\d]{24}$/.test(id))
      throw new NotFoundException('Registro não encontrado.');
  }
}
