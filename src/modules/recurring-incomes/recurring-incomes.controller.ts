import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { dateSchema } from 'src/common/date/civil-date.schema';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  confirmationSchema,
  incomeSchema,
  updateIncomeSchema,
} from './dto/recurring-income.dto';
import { RecurringIncomesService } from './services/recurring-incomes.service';

/** A separação interna preserva as rotas públicas já consumidas pelo frontend. */
@Controller('calendar/incomes')
@UseGuards(AuthTokenGuard)
export class RecurringIncomesController {
  constructor(private readonly service: RecurringIncomesService) {}

  @Get()
  list(@User('sub') userId: string) {
    return this.service.list(userId);
  }

  @Post()
  create(
    @User('sub') userId: string,
    @Body(new ZodValidationPipe(incomeSchema))
    input: Required<z.infer<typeof incomeSchema>>,
  ) {
    return this.service.create(userId, input);
  }

  @Patch(':id')
  update(
    @User('sub') userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateIncomeSchema))
    input: z.infer<typeof updateIncomeSchema> & { revision: number },
  ) {
    return this.service.update(userId, id, input);
  }

  @Post(':id/occurrences/:date/confirm')
  confirm(
    @User('sub') userId: string,
    @Param('id') id: string,
    @Param('date', new ZodValidationPipe(dateSchema)) date: string,
    @Body(new ZodValidationPipe(confirmationSchema))
    input: Required<z.infer<typeof confirmationSchema>>,
  ) {
    return this.service.confirm(userId, id, date, input);
  }
}
