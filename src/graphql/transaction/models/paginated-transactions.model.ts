import { PaginatedResult } from '@/types';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Transaction } from './transaction.model';

@ObjectType()
export class PaginatedTransactions implements PaginatedResult<Transaction> {
  @Field(() => [Transaction])
  data: Transaction[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  limit: number;
}
