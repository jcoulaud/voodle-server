import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

config();

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(ConfigModule);
  const configService = app.get(ConfigService);

  const connection = new Client({
    host: configService.get<string>('DATABASE_HOST'),
    port: configService.get<number>('DATABASE_PORT'),
    user: configService.get<string>('DATABASE_USER'),
    password: configService.get<string>('DATABASE_PASSWORD'),
    database: configService.get<string>('DATABASE_NAME'),
  });

  const db = drizzle(connection);

  console.log('Migrating database...');
  try {
    await connection.connect();
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.log('Database migrated successfully!');
  } catch (error) {
    console.error('Error migrating database:', error);
  } finally {
    await connection.end();
    await app.close();
  }
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}
