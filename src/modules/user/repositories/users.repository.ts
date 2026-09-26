import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  count() {
    return this.prisma.user.count();
  }
  findSample() {
    return this.prisma.user.findMany({ take: 1 });
  }

  create(data: { name: string; email: string; password: string }) {
    return this.prisma.user.create({
      data,
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  findPublic(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  updatePublic(id: string, data: { name?: string; password?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true },
    });
  }
}
