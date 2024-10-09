import { CurrentUser } from '@/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/guards/jwt-auth.guard';
import { TransactionService } from '@/services/db/transaction.service';
import { User } from '@/types';
import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { PaginatedTransactions } from './models/paginated-transactions.model';
import { Transaction } from './models/transaction.model';

@Resolver(() => Transaction)
export class TransactionResolver {
  constructor(private transactionService: TransactionService) {}

  @UseGuards(JwtAuthGuard)
  @Query(() => PaginatedTransactions)
  async getUserTransactions(
    @CurrentUser() user: User,
    @Args('page', { type: () => Int }) page: number,
    @Args('limit', { type: () => Int }) limit: number,
  ): Promise<PaginatedTransactions> {
    return this.transactionService.getUserTransactions(user.id, page, limit);
  }
}
