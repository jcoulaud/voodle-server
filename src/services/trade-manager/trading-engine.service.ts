import { TokenEvaluation, UserStrategy } from '@/types/strategy.types';
import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { Token } from 'src/types';
import { StrategyService } from '../db/strategy.service';
import { TokenService } from '../db/token.service';

@Injectable()
export class TradingEngineService {
  private readonly logger = new Logger(TradingEngineService.name);
  private isRunning = false;

  constructor(
    @InjectQueue('strategy-evaluation') private strategyQueue: Queue<TokenEvaluation>,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(StrategyService) private readonly strategyService: StrategyService,
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Trading Engine is already running.');
      return;
    }

    this.isRunning = true;
    this.logger.log('Trading Engine started. Continuous trading cycle is now active.');
    await this.runContinuousTradingCycle();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.log('Trading Engine stopped.');
  }

  private async runContinuousTradingCycle(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.runTradingCycle();
      } catch (error) {
        this.logger.error('Error in trading cycle:', error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async runTradingCycle(): Promise<void> {
    this.logger.log('Starting new trading cycle');
    const [tokens, strategies] = await Promise.all([
      this.tokenService.getAllTokens(),
      this.strategyService.getAllActiveStrategies(),
    ]);

    this.logger.log(`Retrieved ${tokens.length} tokens and ${strategies.length} active strategies`);

    for (const token of tokens) {
      for (const strategy of strategies) {
        await this.executeStrategyForToken(token, strategy);
      }
    }

    this.logger.log('Trading cycle completed');
  }

  private async executeStrategyForToken(token: Token, strategy: UserStrategy): Promise<void> {
    const evaluation: TokenEvaluation = {
      tokenId: token.id,
      strategyId: strategy.id,
      userId: strategy.userId,
    };

    try {
      const job: Job<TokenEvaluation> = await this.strategyQueue.add('evaluate', evaluation);
      await job.finished();
    } catch (error) {
      this.logger.error(`Error executing strategy ${strategy.id} for token ${token.id}:`, error);
    }
  }
}
