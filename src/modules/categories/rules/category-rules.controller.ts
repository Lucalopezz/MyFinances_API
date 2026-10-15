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
import { CategoryRulesService } from './category-rules.service';
import {
  CreateRuleDto,
  CreateRuleSchema,
  UpdateRuleDto,
  UpdateRuleSchema,
  TestRuleDto,
  TestRuleSchema,
} from '../dto/category.dto';

@Controller('category-rules')
@UseGuards(AuthTokenGuard)
export class CategoryRulesController {
  constructor(private readonly service: CategoryRulesService) {}
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
