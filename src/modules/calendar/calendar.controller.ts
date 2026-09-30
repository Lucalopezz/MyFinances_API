import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { CalendarService } from './calendar.service';
import {
  calendarQuerySchema,
  confirmationSchema,
  dateSchema,
  incomeSchema,
  updateIncomeSchema,
} from './calendar.dto';
@Controller('calendar')
@UseGuards(AuthTokenGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}
  @Get() calendar(
    @User('sub') userId: string,
    @Query(new ZodValidationPipe(calendarQuerySchema))
    query: z.infer<typeof calendarQuerySchema>,
  ) {
    return this.service.calendar(userId, query.month);
  }
  @Get('incomes') list(@User('sub') userId: string) {
    return this.service.list(userId);
  }
  @Post('incomes') create(
    @User('sub') userId: string,
    @Body(new ZodValidationPipe(incomeSchema))
    input: z.infer<typeof incomeSchema>,
  ) {
    return this.service.create(userId, input);
  }
  @Patch('incomes/:id') update(
    @User('sub') userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateIncomeSchema))
    input: z.infer<typeof updateIncomeSchema>,
  ) {
    return this.service.update(userId, id, input);
  }
  @Post('incomes/:id/occurrences/:date/confirm') confirm(
    @User('sub') userId: string,
    @Param('id') id: string,
    @Param('date', new ZodValidationPipe(dateSchema)) date: string,
    @Body(new ZodValidationPipe(confirmationSchema))
    input: Required<z.infer<typeof confirmationSchema>>,
  ) {
    return this.service.confirm(userId, id, date, input);
  }
}
