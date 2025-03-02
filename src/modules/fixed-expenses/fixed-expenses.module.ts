import { forwardRef, Module } from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import { FixedExpensesController } from './fixed-expenses.controller';
import { AppModule } from 'src/modules/app/app.module';

@Module({
  controllers: [FixedExpensesController],
  providers: [FixedExpensesService],
  imports: [forwardRef(() => AppModule)],
})
export class FixedExpensesModule {}
