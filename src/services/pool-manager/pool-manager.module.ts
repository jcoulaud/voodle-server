import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomHttpModule } from '../config/http.module';
import { PoolModule } from '../db/pool.module';
import { TokenModule } from '../db/token.module';
import { TonApiModule } from '../integrations/ton-api.module';
import { PoolManager } from './pool-manager.service';

@Module({
  imports: [ConfigModule, CustomHttpModule, TokenModule, PoolModule, TonApiModule],
  providers: [PoolManager],
  exports: [PoolManager],
})
export class PoolManagerModule {}
