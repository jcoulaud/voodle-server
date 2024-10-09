import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/db/database.module';
import { FeeService } from './fee.service';

@Module({
  imports: [DatabaseModule],
  providers: [FeeService],
  exports: [FeeService],
})
export class FeeModule {}
