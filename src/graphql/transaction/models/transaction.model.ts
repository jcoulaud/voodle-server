import {
  Dex,
  Transaction as TransactionInterface,
  TransactionStatus,
  TransactionType,
} from '@/types';
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Transaction implements TransactionInterface {
  @Field(() => ID)
  id: number;

  @Field()
  created_at: Date;

  @Field(() => ID)
  token_id: number;

  @Field(() => ID)
  strategy_id: number;

  @Field(() => ID)
  user_id: number;

  @Field(() => String)
  type: TransactionType;

  @Field()
  amount_token: string;

  @Field()
  amount_ton: string;

  @Field()
  price_in_usd: string;

  @Field(() => String)
  dex: Dex;

  @Field(() => String)
  status: TransactionStatus;

  @Field(() => String, { nullable: true })
  transaction_id?: string;
}
