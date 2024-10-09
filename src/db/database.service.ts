import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private db: ReturnType<typeof drizzle>;

  constructor(@Optional() @Inject(ConfigService) private configService: ConfigService) {}

  async onModuleInit() {
    if (!this.db) {
      await this.connect();
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect() {
    if (this.db) {
      return this.db;
    }

    try {
      const dbConfig = {
        host: this.configService.get<string>('DATABASE_HOST'),
        port: this.configService.get<number>('DATABASE_PORT'),
        user: this.configService.get<string>('DATABASE_USER'),
        password: this.configService.get<string>('DATABASE_PASSWORD'),
        database: this.configService.get<string>('DATABASE_NAME'),
      };

      Object.entries(dbConfig).forEach(([key, value]) => {
        if (value === undefined) {
          throw new Error(`Database config '${key}' is missing`);
        }
      });

      this.client = new Client(dbConfig);

      await this.client.connect();
      this.db = drizzle(this.client, { schema });

      console.log('Database connected and initialized');
      return this.db;
    } catch (error) {
      console.error(`Failed to connect to the database: ${error}`);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      this.db = null;
      console.log('Database disconnected');
    }
  }

  getDB() {
    if (!this.db) {
      throw new Error('Database not initialized. Call connect() first.');
    }
    return this.db;
  }
}
