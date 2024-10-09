import { Blockchain } from '@/types/wallet.types';
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Wallet {
  @Field(() => String)
  blockchain: Blockchain;

  @Field(() => String)
  address: string;
}
