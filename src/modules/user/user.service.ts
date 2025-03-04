import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserType } from './dto/create-user.dto';
import { UpdateUserType } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { HashingService } from '../auth/hashing/hashing.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private readonly hashingService: HashingService,
  ) {}
  async create(createUserDto: CreateUserType) {
    try {
      const passwordHash = await this.hashingService.hash(
        createUserDto.password,
      );

      const userData = {
        name: createUserDto.name,
        email: createUserDto.email,
        password: passwordHash,
      };

      const newUser = await this.prisma.user.create({
        data: userData,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      return {
        message: 'Usuário criado com sucesso',
        user: newUser,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('E-mail já cadastrado');
        }
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Create User Error:', error);
      throw new InternalServerErrorException('Erro ao criar usuário');
    }
  }

  async findOneById(id: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Find One User Error:', error);
      throw new InternalServerErrorException('Erro ao buscar usuário');
    }
  }

  async update(userId: string, updateUserDto: UpdateUserType) {
    try {
      await this.findOneById(userId);

      const userData: { name?: string; password?: string } = {};

      if (updateUserDto?.name) {
        userData.name = updateUserDto.name;
      }

      if (updateUserDto?.password) {
        userData.password = await this.hashingService.hash(
          updateUserDto.password,
        );
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: userData,
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      return {
        message: 'Usuário atualizado com sucesso',
        user: updatedUser,
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      console.error('Update User Error:', error);
      throw new InternalServerErrorException('Erro ao atualizar usuário');
    }
  }
}
