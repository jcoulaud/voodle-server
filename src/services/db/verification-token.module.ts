import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/db/database.module';
import { VerificationTokenService } from './verification-token.service';

@Module({
  imports: [DatabaseModule],
  providers: [VerificationTokenService],
  exports: [VerificationTokenService],
})
export class VerificationTokenModule {}
