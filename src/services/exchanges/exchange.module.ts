import { Module } from '@nestjs/common';
import { CustomHttpModule } from '../config/http.module';
import { FeeService } from '../db/fee.service';
import { TokenService } from '../db/token.service';
import { TonApiService } from '../integrations/ton-api.service';
import { WalletService } from '../wallet/wallet.service';
import { DeDustService } from './dedust.service';
import { StonFiService } from './stonfi.service';

@Module({
  imports: [CustomHttpModule],
  providers: [DeDustService, StonFiService, WalletService, TokenService, TonApiService, FeeService],
  exports: [DeDustService, StonFiService],
})
export class ExchangeModule {}
