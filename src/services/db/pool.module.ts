import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/db/database.module';
import { PoolService } from './pool.service';
import { TokenModule } from './token.module';

@Module({
  imports: [DatabaseModule, TokenModule],
  providers: [PoolService],
  exports: [PoolService],
})
export class PoolModule {}
