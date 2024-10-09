import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { logger } from 'src/helpers';
import { TradingEngineService } from './trading-engine.service';
import { TradingModule } from './trading.module';

config();

async function startTradingEngine(): Promise<void> {
  let app: INestApplication | null = null;

  try {
    logger.info('Initializing Trading Engine...');

    app = await NestFactory.create(TradingModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    await app.init();

    const tradingEngineService = app.get(TradingEngineService);

    logger.info('Starting Trading Engine...');
    await tradingEngineService.start();

    logger.success('Trading Engine started successfully');

    process.on('SIGINT', async () => {
      await gracefulShutdown(app, tradingEngineService);
    });
    process.on('SIGTERM', async () => {
      await gracefulShutdown(app, tradingEngineService);
    });
  } catch (error) {
    logger.error(`Failed to start the Trading Engine: ${error}`);
    if (error instanceof Error) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    if (error instanceof Error && error.message?.includes('Circular dependency')) {
      logger.error('Circular dependencies detected:');
      logger.error(error.message);
    }
    await gracefulShutdown(app);
    process.exit(1);
  }
}

async function gracefulShutdown(
  app: INestApplication | null,
  tradingEngineService?: TradingEngineService,
): Promise<void> {
  logger.info('Initiating graceful shutdown...');

  if (tradingEngineService) {
    logger.info('Stopping Trading Engine...');
    await tradingEngineService.stop();
    logger.info('Trading Engine stopped');
  }

  if (app) {
    logger.info('Closing NestJS application...');
    await app.close();
    logger.info('NestJS application closed');
  }

  logger.info('Graceful shutdown completed');
  process.exit(0);
}

startTradingEngine();
