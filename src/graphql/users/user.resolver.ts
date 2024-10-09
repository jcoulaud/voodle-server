import { CurrentUser } from '@/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/guards/jwt-auth.guard';
import { Injectable, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UserService } from 'src/services/db/user.service';
import { EditUserInput } from './dto/edit-user.input';
import { User } from './models/user.model';

@Injectable()
@Resolver(() => User)
export class UserResolver {
  constructor(private userService: UserService) {}

  @UseGuards(JwtAuthGuard)
  @Query(() => User, { nullable: true })
  async me(@CurrentUser() user: User): Promise<User | null> {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => User)
  async editUser(@CurrentUser() user: User, @Args('input') input: EditUserInput): Promise<User> {
    const updatedUser = await this.userService.editUser(user.id, input);
    if (!updatedUser) {
      throw new Error('Failed to update user');
    }
    return updatedUser;
  }
}
