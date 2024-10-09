import { JwtAuthGuard } from '@/guards/jwt-auth.guard';
import { WalletService } from '@/services/wallet/wallet.service';
import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Success } from '../shared/models/success.model';
import { Wallet } from './models/wallet.model';

@Resolver(() => Wallet)
export class WalletResolver {
  constructor(private walletService: WalletService) {}

  @Query(() => [Wallet])
  @UseGuards(JwtAuthGuard)
  async getUserWallets(@Context() context: any): Promise<Wallet[]> {
    const userId = context.req.user.id;
    return this.walletService.getUserWallets(userId);
  }

  @Query(() => String)
  @UseGuards(JwtAuthGuard)
  async getWalletPrivateKey(
    @Context() context: any,
    @Args('address', { type: () => String }) address: string,
  ): Promise<string> {
    const userId = context.req.user.id;
    return this.walletService.getWalletPrivateKey(userId, address);
  }

  @Query(() => String)
  async getWalletBalance(@Args('address') address: string): Promise<number> {
    return this.walletService.getAccountBalance(address);
  }

  @Mutation(() => Success)
  @UseGuards(JwtAuthGuard)
  async withdrawFunds(
    @Context() context: any,
    @Args('fromAddress') fromAddress: string,
    @Args('toAddress') toAddress: string,
    @Args('amount') amount: string,
  ): Promise<Success> {
    const userId = context.req.user.id;
    return await this.walletService.withdrawFunds(userId, fromAddress, toAddress, amount);
  }
}
