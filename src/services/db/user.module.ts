import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/db/database.module';
import { UserResolver } from 'src/graphql/users/user.resolver';
import { UserService } from 'src/services/db/user.service';

@Module({
  imports: [DatabaseModule],
  providers: [UserService, UserResolver],
  exports: [UserService],
})
export class UsersModule {}
