import { Controller, Get, Post, Body, Patch, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserSchema, CreateUserType } from './dto/create-user.dto';
import { UpdateUserSchema, UpdateUserType } from './dto/update-user.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateUserSchema))
    createUserDto: CreateUserType,
  ) {
    return this.userService.create(createUserDto);
  }

  @Get('/get-one')
  @UseGuards(AuthTokenGuard)
  findOne(@User('sub') userId: string) {
    return this.userService.findOneById(userId);
  }

  @Patch('/update')
  @UseGuards(AuthTokenGuard)
  update(
    @User('sub') userId: string,
    @Body(new ZodValidationPipe(UpdateUserSchema))
    updateUserDto: UpdateUserType,
  ) {
    return this.userService.update(userId, updateUserDto);
  }
}
