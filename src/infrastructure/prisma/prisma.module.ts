import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Compartilha o cliente e seu ciclo de conexão sem depender do módulo raiz. */
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
