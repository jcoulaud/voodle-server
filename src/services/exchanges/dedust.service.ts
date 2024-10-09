import {
  Asset,
  Factory,
  JettonRoot,
  MAINNET_FACTORY_ADDR,
  Pool,
  PoolType,
  ReadinessStatus,
  VaultJetton,
  VaultNative,
} from '@dedust/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';
import { keyPairFromSecretKey } from '@ton/crypto';
import { Address, OpenedContract, toNano, TonClient4, WalletContractV4 } from '@ton/ton';
import { SWAP_GAS_AMOUNT } from 'src/constants';
import { TransactionResult, TransactionStatus } from 'src/types';
import { TokenService } from '../db/token.service';
import { TonApiService } from '../integrations/ton-api.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class DeDustService {
  private tonClient: TonClient4;
  private factory: OpenedContract<Factory>;
  private isInitialized: boolean = false;
  private tonVault: OpenedContract<VaultNative> | null = null;
  private tokenAddress: Address | null = null;
  private ton: Asset | null = null;
  private token: Asset | null = null;
  private pool: OpenedContract<Pool> | null = null;

  constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(TonApiService) private readonly tonApiService: TonApiService,
    @Inject(WalletService) private readonly walletService: WalletService,
  ) {
    this.tonClient = {} as TonClient4;
    this.factory = {} as OpenedContract<Factory>;
  }

  private async init(): Promise<void> {
    if (this.isInitialized) return;
    const endpoint = await getHttpV4Endpoint();
    this.tonClient = new TonClient4({ endpoint });
    this.factory = this.tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
    this.isInitialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  private async getUserWallet(userId: number) {
    await this.ensureInitialized();
    const userWallets = await this.walletService.getUserWallets(userId);
    const tonWallet = userWallets.find((wallet) => wallet.blockchain === 'ton');

    if (!tonWallet) {
      throw new Error('User does not have a TON wallet');
    }

    const privateKey = await this.walletService.getWalletPrivateKey(userId, tonWallet.address);
    const keyPair = keyPairFromSecretKey(Buffer.from(privateKey, 'hex'));
    const wallet = this.tonClient.open(
      WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey }),
    );
    return { sender: wallet.sender(keyPair.secretKey), wallet, keyPair };
  }

  private async initializePool(address: string): Promise<boolean> {
    await this.ensureInitialized();

    this.tonVault = this.tonClient.open(await this.factory.getNativeVault());
    this.tokenAddress = Address.parse(address);
    this.ton = Asset.native();
    this.token = Asset.jetton(this.tokenAddress);
    this.pool = this.tonClient.open(
      await this.factory.getPool(PoolType.VOLATILE, [this.ton, this.token]),
    );

    // Verify pool and vault readiness
    const [poolStatus, vaultStatus] = await Promise.all([
      this.pool.getReadinessStatus(),
      this.tonVault.getReadinessStatus(),
    ]);

    return poolStatus === ReadinessStatus.READY && vaultStatus === ReadinessStatus.READY;
  }

  private async resetPool(): Promise<void> {
    this.tonVault = null;
    this.tokenAddress = null;
    this.ton = null;
    this.token = null;
    this.pool = null;
  }

  async buyToken(userId: number, address: string, amount: number): Promise<TransactionResult> {
    await this.ensureInitialized();

    const poolInitialized = await this.initializePool(address);
    if (!poolInitialized || !this.tonVault || !this.pool) {
      return { status: TransactionStatus.Failed };
    }

    const { sender } = await this.getUserWallet(userId);
    const amountIn = toNano(amount);

    try {
      await this.tonVault.sendSwap(sender, {
        poolAddress: this.pool.address,
        amount: amountIn,
        gasAmount: toNano(SWAP_GAS_AMOUNT),
      });

      return { status: TransactionStatus.Success };
    } catch (error) {
      console.error('Error buying token on DeDust:', error);
      return { status: TransactionStatus.Failed };
    } finally {
      await this.resetPool();
    }
  }

  async sellToken(userId: number, address: string, amount: string): Promise<TransactionResult> {
    await this.ensureInitialized();

    const poolInitialized = await this.initializePool(address);
    if (!poolInitialized || !this.pool || !this.tokenAddress) {
      return { status: TransactionStatus.Failed };
    }
    const { sender, wallet } = await this.getUserWallet(userId);

    const [tokenVault, tokenRoot] = await Promise.all([
      this.factory.getJettonVault(this.tokenAddress).then((v) => this.tonClient.open(v)),
      Promise.resolve(JettonRoot.createFromAddress(this.tokenAddress)).then((r) =>
        this.tonClient.open(r),
      ),
    ]);

    const tokenWallet = this.tonClient.open(await tokenRoot.getWallet(wallet.address));
    const amountToSell = toNano(amount);

    try {
      await tokenWallet.sendTransfer(sender, toNano('0.3'), {
        amount: amountToSell,
        destination: tokenVault.address,
        responseAddress: wallet.address,
        forwardAmount: toNano(SWAP_GAS_AMOUNT),
        forwardPayload: VaultJetton.createSwapPayload({ poolAddress: this.pool.address }),
      });

      return { status: TransactionStatus.Success };
    } catch (error) {
      console.error(`Error selling token on DeDust:`, error);
      return { status: TransactionStatus.Failed };
    } finally {
      await this.resetPool();
    }
  }
}
