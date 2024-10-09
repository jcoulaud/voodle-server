import { CurrentUser } from '@/decorators/current-user.decorator';
import { User } from '@/graphql/users/models/user.model';
import { JwtAuthGuard } from '@/guards/jwt-auth.guard';
import { StrategyService } from '@/services/db/strategy.service';
import { UserStrategy } from '@/types/strategy.types';
import { UseGuards } from '@nestjs/common';
import { Args, Float, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CreateStrategyInput } from './dto/create-strategy.input';
import { EditStrategyInput } from './dto/edit-strategy.input';
import { Strategy } from './models/strategy.model';

@Resolver(() => Strategy)
export class StrategyResolver {
  constructor(private strategyService: StrategyService) {}

  @Mutation(() => Strategy)
  @UseGuards(JwtAuthGuard)
  async createStrategy(
    @Args('input') input: CreateStrategyInput,
    @CurrentUser() user: User,
  ): Promise<Strategy> {
    return this.strategyService.createStrategy(input, user.id);
  }

  @Mutation(() => Strategy)
  @UseGuards(JwtAuthGuard)
  async editStrategy(
    @Args('input') input: EditStrategyInput,
    @CurrentUser() user: User,
  ): Promise<Strategy> {
    return this.strategyService.editStrategy(input, user.id);
  }

  @Query(() => [Strategy])
  @UseGuards(JwtAuthGuard)
  async userStrategies(@CurrentUser() user: User): Promise<UserStrategy[]> {
    return this.strategyService.getStrategiesByUserId(user.id);
  }

  @ResolveField(() => Float)
  async pnlUSD(@Parent() strategy: UserStrategy) {
    const { pnlUSD } = await this.strategyService.getStrategyWithPNL(strategy.id);
    return pnlUSD;
  }

  @ResolveField(() => Float)
  async pnlTON(@Parent() strategy: UserStrategy) {
    const { pnlTON } = await this.strategyService.getStrategyWithPNL(strategy.id);
    return pnlTON;
  }
}
