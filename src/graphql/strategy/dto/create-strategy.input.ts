import { StrategyLogic } from '@/types/strategy.types';
import { Field, Float, InputType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min, ValidateNested } from 'class-validator';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class CreateStrategyInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field(() => GraphQLJSON)
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => Object)
  strategy: StrategyLogic;

  @Field(() => Float)
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  maxBetAmount: number;
}
