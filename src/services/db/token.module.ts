import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/db/database.module';
import { TokenService } from './token.service';

@Module({
  imports: [DatabaseModule],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
