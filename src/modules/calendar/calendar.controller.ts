import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { CalendarService } from './services/calendar.service';
import { calendarQuerySchema } from './dto/calendar.dto';

@Controller('calendar')
@UseGuards(AuthTokenGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get()
  calendar(
    @User('sub') userId: string,
    @Query(new ZodValidationPipe(calendarQuerySchema))
    query: z.infer<typeof calendarQuerySchema>,
  ) {
    return this.service.calendar(userId, query.month);
  }
}
