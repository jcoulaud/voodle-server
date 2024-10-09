import { TransactionResolver } from '@/graphql/transaction/transaction.resolver';
import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/db/database.module';
import { TransactionService } from './transaction.service';

@Module({
  imports: [DatabaseModule],
  providers: [TransactionService, TransactionResolver],
  exports: [TransactionService],
})
export class TransactionModule {}
