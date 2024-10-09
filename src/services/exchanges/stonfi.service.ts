import { Inject, Injectable } from '@nestjs/common';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';
import { DEX, pTON } from '@ston-fi/sdk';
import { RouterV1 } from '@ston-fi/sdk/dist/contracts/dex/v1/RouterV1';
import { keyPairFromSecretKey } from '@ton/crypto';
import { OpenedContract, toNano, TonClient4, WalletContractV4 } from '@ton/ton';
import { TransactionResult, TransactionStatus } from 'src/types';
import { TokenService } from '../db/token.service';
import { TonApiService } from '../integrations/ton-api.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class StonFiService {
  private tonClient: TonClient4;
  private router: OpenedContract<RouterV1>;
  private isInitialized: boolean = false;

  constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(TonApiService) private readonly tonApiService: TonApiService,
    @Inject(WalletService) private readonly walletService: WalletService,
  ) {
    this.tonClient = {} as TonClient4;
    this.router = {} as OpenedContract<RouterV1>;
  }

  private async init(): Promise<void> {
    if (this.isInitialized) return;
    const endpoint = await getHttpV4Endpoint();
    this.tonClient = new TonClient4({ endpoint });
    this.router = this.tonClient.open(new DEX.v1.Router());
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

  async buyToken(userId: number, address: string, amount: number): Promise<TransactionResult> {
    await this.ensureInitialized();

    const { wallet, keyPair } = await this.getUserWallet(userId);

    const txArgs = {
      userWalletAddress: wallet.address.toString(),
      proxyTon: new pTON.v1(),
      offerAmount: toNano(amount),
      askJettonAddress: address,
      minAskAmount: toNano(amount),
    };

    try {
      await this.router.sendSwapTonToJetton(wallet.sender(keyPair.secretKey), txArgs);

      return { status: TransactionStatus.Success };
    } catch (error) {
      console.error('Error buying token on Ston.fi:', error);
      return { status: TransactionStatus.Failed };
    }
  }

  async sellToken(userId: number, address: string, amount: string): Promise<TransactionResult> {
    await this.ensureInitialized();

    const { wallet, keyPair } = await this.getUserWallet(userId);

    const amountToSell = toNano(amount);

    const txArgs = {
      userWalletAddress: wallet.address.toString(),
      proxyTon: new pTON.v1(),
      offerJettonAddress: address,
      offerAmount: amountToSell,
      minAskAmount: toNano(Number(amountToSell) * 0.8),
    };

    try {
      await this.router.sendSwapJettonToTon(wallet.sender(keyPair.secretKey), txArgs);

      return { status: TransactionStatus.Success };
    } catch (error) {
      console.error(`Error selling token on Ston.fi:`, error);
      return { status: TransactionStatus.Failed };
    }
  }
}
