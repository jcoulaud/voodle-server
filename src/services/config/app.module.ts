import { DatabaseModule } from '@/db/database.module';
import { GqlThrottlerGuard } from '@/guards/gql-throttler.guard';
import { JwtAuthGuard } from '@/guards/jwt-auth.guard';
import { AuthModule } from '@/services/auth/auth.module';
import { PoolModule } from '@/services/db/pool.module';
import { StrategyModule } from '@/services/db/strategy.module';
import { TokenModule } from '@/services/db/token.module';
import { TransactionModule } from '@/services/db/transaction.module';
import { UsersModule } from '@/services/db/user.module';
import { TonApiModule } from '@/services/integrations/ton-api.module';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { FeeModule } from '../db/fee.module';
import { ExchangeModule } from '../exchanges/exchange.module';
import { WalletModule } from '../wallet/wallet.module';
import configuration from './configuration';
import { validateConfig } from './env.validation';

const ENV = process.env.NODE_ENV;

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: !ENV ? '.env' : `.env.${ENV}`,
      validate: validateConfig,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: (configService: ConfigService) => ({
        autoSchemaFile: join(process.cwd(), 'src/graphql/schema.gql'),
        sortSchema: true,
        playground: configService.get('NODE_ENV') !== 'production',
        context: ({ req, res }) => ({ req, res }),
        cors: {
          origin: configService.get('BASE_URL'),
          credentials: true,
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    AuthModule,
    TonApiModule,
    PoolModule,
    StrategyModule,
    TokenModule,
    TransactionModule,
    UsersModule,
    WalletModule,
    ExchangeModule,
    FeeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
