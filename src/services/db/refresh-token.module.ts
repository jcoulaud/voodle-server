import { DatabaseModule } from '@/db/database.module';
import { Module } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [DatabaseModule],
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule {}
