import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { logger } from 'src/helpers';
import { PoolManagerModule } from './pool-manager.module';
import { PoolManager } from './pool-manager.service';

config();

async function startPoolManager() {
  try {
    logger.info('Initializing PoolManager...');

    const app = await NestFactory.create(PoolManagerModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    await app.init();

    const poolManager = app.get(PoolManager);

    if (!poolManager) {
      throw new Error('PoolManager is undefined');
    }

    poolManager.startMonitoring();
  } catch (error) {
    logger.error(`Failed to start the PoolManager: ${error}`);
    if (error instanceof Error) {
      logger.error(`${error.stack}`);
    }
    process.exit(1);
  }
}

startPoolManager();
