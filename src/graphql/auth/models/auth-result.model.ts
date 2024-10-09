import { Field, ObjectType, createUnionType } from '@nestjs/graphql';

@ObjectType()
export class AuthResultBase {
  @Field()
  success: boolean;

  @Field()
  message: string;
}

@ObjectType()
export class AuthResultWithMnemonic extends AuthResultBase {
  @Field()
  mnemonic: string;
}

export const AuthResult = createUnionType({
  name: 'AuthResult',
  types: () => [AuthResultBase, AuthResultWithMnemonic] as const,
  resolveType(value) {
    if ('mnemonic' in value) {
      return AuthResultWithMnemonic;
    }
    return AuthResultBase;
  },
});
