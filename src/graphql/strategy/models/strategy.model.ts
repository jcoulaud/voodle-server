import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class Strategy {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field(() => GraphQLJSON)
  strategyLogic: any;

  @Field()
  maxBetAmount: number;

  @Field(() => ID)
  userId: number;

  @Field()
  isActive: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => Float, { nullable: true })
  pnlUSD?: number;

  @Field(() => Float, { nullable: true })
  pnlTON?: number;
}
