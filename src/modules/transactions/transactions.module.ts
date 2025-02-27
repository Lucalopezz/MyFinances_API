import { forwardRef, Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AppModule } from '../app/app.module';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
  imports: [forwardRef(() => AppModule)],
})
export class TransactionsModule {}
