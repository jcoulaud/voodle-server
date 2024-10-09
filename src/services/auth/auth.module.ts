import { AuthResolver } from '@/graphql/auth/auth.resolver';
import { UsersModule } from '@/services/db/user.module';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CustomHttpModule } from '../config/http.module';
import { RefreshTokenModule } from '../db/refresh-token.module';
import { VerificationTokenModule } from '../db/verification-token.module';
import { TonApiModule } from '../integrations/ton-api.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    CustomHttpModule,
    VerificationTokenModule,
    RefreshTokenModule,
    WalletModule,
    TonApiModule,
  ],
  providers: [AuthService, AuthResolver, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
