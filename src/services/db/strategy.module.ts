import { DatabaseModule } from '@/db/database.module';
import { StrategyResolver } from '@/graphql/strategy/strategy.resolver';
import { Module } from '@nestjs/common';
import { StrategyService } from './strategy.service';
import { TransactionModule } from './transaction.module';

@Module({
  imports: [DatabaseModule, TransactionModule],
  providers: [StrategyService, StrategyResolver],
  exports: [StrategyService],
})
export class StrategyModule {}
