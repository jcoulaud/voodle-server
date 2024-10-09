import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from 'src/db/database.module';
import { FeeModule } from '../db/fee.module';
import { StrategyModule } from '../db/strategy.module';
import { TokenModule } from '../db/token.module';
import { TransactionModule } from '../db/transaction.module';
import { UsersModule } from '../db/user.module';
import { DeDustService } from '../exchanges/dedust.service';
import { StonFiService } from '../exchanges/stonfi.service';
import { TonApiModule } from '../integrations/ton-api.module';
import { WalletModule } from '../wallet/wallet.module';
import { StrategyExecutorService } from './strategy-executor.service';
import { TradeExecutorService } from './trade-executor.service';
import { TradingEngineService } from './trading-engine.service';
import { TransactionPollingService } from './transaction-polling-service';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'strategy-evaluation',
    }),
    DatabaseModule,
    TonApiModule,
    TokenModule,
    WalletModule,
    StrategyModule,
    TransactionModule,
    UsersModule,
    WalletModule,
    FeeModule,
  ],
  providers: [
    TradingEngineService,
    StrategyExecutorService,
    TradeExecutorService,
    DeDustService,
    StonFiService,
    TransactionPollingService,
  ],
  exports: [TradingEngineService],
})
export class TradingModule {}
