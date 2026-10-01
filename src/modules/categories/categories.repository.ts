import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
  find(id: string, userId: string) {
    return this.prisma.category.findFirst({ where: { id, userId } });
  }
  create(data: Prisma.CategoryUncheckedCreateInput) {
    return this.prisma.category.create({ data });
  }
  update(id: string, userId: string, data: Prisma.CategoryUpdateInput) {
    return this.prisma.category.update({ where: { id, userId }, data });
  }
  rules(userId: string, type?: TransactionType) {
    return this.prisma.categoryRule.findMany({
      where: { userId, type },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
  }
  findRule(id: string, userId: string) {
    return this.prisma.categoryRule.findFirst({ where: { id, userId } });
  }
  createRule(data: Prisma.CategoryRuleUncheckedCreateInput) {
    return this.prisma.categoryRule.create({ data });
  }
  updateRule(id: string, userId: string, data: Prisma.CategoryRuleUpdateInput) {
    return this.prisma.categoryRule.update({ where: { id, userId }, data });
  }
  removeRule(id: string, userId: string) {
    return this.prisma.categoryRule.delete({ where: { id, userId } });
  }
}
