import { DatabaseModule } from '@/db/database.module';
import { WalletResolver } from '@/graphql/wallet/wallet.resolver';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomHttpModule } from '../config/http.module';
import { TonApiModule } from '../integrations/ton-api.module';
import { WalletService } from './wallet.service';

@Module({
  imports: [ConfigModule, DatabaseModule, CustomHttpModule, TonApiModule],
  providers: [WalletService, WalletResolver],
  exports: [WalletService],
})
export class WalletModule {}
