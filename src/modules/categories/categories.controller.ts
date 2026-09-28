import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  CreateCategorySchema,
  UpdateCategoryDto,
  UpdateCategorySchema,
  CreateRuleDto,
  CreateRuleSchema,
  UpdateRuleDto,
  UpdateRuleSchema,
  ResolveCategoryDto,
  ResolveCategorySchema,
  TestRuleDto,
  TestRuleSchema,
} from './category.dto';

@Controller('categories')
@UseGuards(AuthTokenGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}
  @Get()
  list(@User('sub') userId: string) {
    return this.service.list(userId);
  }
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateCategorySchema)) dto: CreateCategoryDto,
    @User('sub') userId: string,
  ) {
    return this.service.create(dto, userId);
  }
  @Post('resolve')
  resolve(
    @Body(new ZodValidationPipe(ResolveCategorySchema)) dto: ResolveCategoryDto,
    @User('sub') userId: string,
  ) {
    return this.service.resolve(dto, userId);
  }
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCategorySchema)) dto: UpdateCategoryDto,
    @User('sub') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }
}

@Controller('category-rules')
@UseGuards(AuthTokenGuard)
export class CategoryRulesController {
  constructor(private readonly service: CategoriesService) {}
  @Get()
  list(@User('sub') userId: string) {
    return this.service.listRules(userId);
  }
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateRuleSchema)) dto: CreateRuleDto,
    @User('sub') userId: string,
  ) {
    return this.service.createRule(dto, userId);
  }
  @Post('test')
  test(
    @Body(new ZodValidationPipe(TestRuleSchema)) dto: TestRuleDto,
    @User('sub') userId: string,
  ) {
    return this.service.testRule(dto, userId);
  }
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRuleSchema)) dto: UpdateRuleDto,
    @User('sub') userId: string,
  ) {
    return this.service.updateRule(id, dto, userId);
  }
  @Delete(':id')
  remove(@Param('id') id: string, @User('sub') userId: string) {
    return this.service.removeRule(id, userId);
  }
}
