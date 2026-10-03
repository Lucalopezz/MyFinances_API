import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { CardsService } from './cards.service';
import {
  cardSchema,
  cycleSchema,
  paymentSchema,
  purchaseSchema,
} from './cards.dto';

@Controller('cards')
@UseGuards(AuthTokenGuard)
export class CardsController {
  constructor(private readonly service: CardsService) {}
  @Get() list(@User('sub') userId: string) {
    return this.service.listCards(userId);
  }
  @Post() create(
    @User('sub') userId: string,
    @Body(new ZodValidationPipe(cardSchema)) input: z.infer<typeof cardSchema>,
  ) {
    return this.service.createCard(userId, input);
  }
  @Get(':id') detail(@User('sub') userId: string, @Param('id') id: string) {
    return this.service.detail(userId, id);
  }
  @Delete(':id') remove(@User('sub') userId: string, @Param('id') id: string) {
    return this.service.removeCard(userId, id);
  }
  @Post(':id/purchases') purchase(
    @User('sub') userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(purchaseSchema))
    input: z.infer<typeof purchaseSchema>,
  ) {
    return this.service.createPurchase(userId, id, input);
  }
  @Post(':id/invoices/:cycle/pay') pay(
    @User('sub') userId: string,
    @Param('id') id: string,
    @Param('cycle', new ZodValidationPipe(cycleSchema)) cycle: string,
    @Body(new ZodValidationPipe(paymentSchema))
    input: z.infer<typeof paymentSchema>,
  ) {
    return this.service.payInvoice(userId, id, cycle, input.date);
  }
}
