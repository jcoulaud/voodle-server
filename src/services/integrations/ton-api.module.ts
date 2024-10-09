import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomHttpModule } from '../config/http.module';
import { FeeModule } from '../db/fee.module';
import { TonApiService } from './ton-api.service';

@Module({
  imports: [ConfigModule, CustomHttpModule, FeeModule],
  providers: [TonApiService],
  exports: [TonApiService],
})
export class TonApiModule {}
