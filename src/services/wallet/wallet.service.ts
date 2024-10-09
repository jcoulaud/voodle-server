import { TRANSFER_GAS_AMOUNT } from '@/constants';
import { Success } from '@/graphql/shared/models/success.model';
import { Wallet } from '@/types/wallet.types';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';
import { KeyPair, keyPairFromSecretKey, mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { internal, toNano, TonClient4, WalletContractV4 } from '@ton/ton';
import * as crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { wallets } from 'src/db/schema';
import { TonApiService } from '../integrations/ton-api.service';

@Injectable()
export class WalletService {
  private tonClient: TonClient4;

  constructor(
    @Inject('DATABASE_CONNECTION') private db: NodePgDatabase,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TonApiService) private tonApiService: TonApiService,
  ) {
    this.initTonClient();
  }

  async createTonWallet(userId: number): Promise<string> {
    const existingWallet = await this.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.blockchain, 'ton')))
      .limit(1);

    if (existingWallet.length > 0) {
      return existingWallet[0].address;
    }

    const mnemonics = await mnemonicNew();

    const keyPair = await mnemonicToPrivateKey(mnemonics);

    const workchain = 0;
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });

    const encryptedPrivateKey = this.encryptPrivateKey(keyPair.secretKey.toString('hex'));

    try {
      await this.db.insert(wallets).values({
        user_id: userId,
        blockchain: 'ton',
        address: wallet.address.toString(),
        private_key: encryptedPrivateKey,
      });
    } catch (error) {
      if (error.code === '23505') {
        // PostgreSQL error code for unique constraint violation
        return wallet.address.toString();
      }
      throw error;
    }

    return mnemonics.join(' ');
  }

  async getUserWallets(userId: number): Promise<Pick<Wallet, 'blockchain' | 'address'>[]> {
    const userWallets = await this.db
      .select({
        blockchain: wallets.blockchain,
        address: wallets.address,
      })
      .from(wallets)
      .where(eq(wallets.user_id, userId));

    return userWallets;
  }

  async getWalletPrivateKey(userId: number, address: string): Promise<string> {
    const wallet = await this.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.address, address), eq(wallets.user_id, userId)))
      .limit(1);

    if (!wallet || wallet.length === 0) {
      throw new NotFoundException('Wallet not found');
    }

    const walletData = wallet[0] as Wallet;

    if (!walletData.private_key) {
      throw new NotFoundException('Private key not found for this wallet');
    }

    return this.decryptPrivateKey(walletData.private_key);
  }

  async getAccountBalance(address: string): Promise<number> {
    const account = await this.tonApiService.getAccount(address);
    return account.balance;
  }

  async withdrawFunds(
    userId: number,
    fromAddress: string,
    toAddress: string,
    amount: string,
    isFeeTransfer: boolean = false,
  ): Promise<Success> {
    const userWallet = await this.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.address, fromAddress)))
      .limit(1);

    if (!userWallet || userWallet.length === 0) {
      throw new ForbiddenException('You do not have permission to withdraw from this wallet');
    }

    const wallet = userWallet[0];
    const privateKey = this.decryptPrivateKey(wallet.private_key);

    const balance = await this.getAccountBalance(fromAddress);
    const balanceBigInt = BigInt(balance);
    const amountBigInt = BigInt(toNano(amount));
    const feeBigInt = BigInt(toNano(TRANSFER_GAS_AMOUNT));

    if (amountBigInt <= feeBigInt) {
      return { success: true };
    }

    let amountToSend: bigint;

    if (amountBigInt === balanceBigInt) {
      if (balanceBigInt <= feeBigInt) {
        throw new HttpException('Insufficient balance to cover fees', HttpStatus.BAD_REQUEST);
      }
      amountToSend = balanceBigInt - feeBigInt;
    } else if (amountBigInt + feeBigInt > balanceBigInt) {
      throw new HttpException(
        'Insufficient balance to cover amount and fees',
        HttpStatus.BAD_REQUEST,
      );
    } else {
      amountToSend = amountBigInt - feeBigInt;
    }

    try {
      const workchain = 0;
      const privateKeyBuffer = Buffer.from(privateKey, 'hex');
      const keyPair: KeyPair = keyPairFromSecretKey(privateKeyBuffer);
      const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
      const contract = this.tonClient.open(wallet);
      const seqno = await contract.getSeqno();

      let amountToSend: bigint;

      if (isFeeTransfer) {
        amountToSend = amountBigInt;
      } else {
        if (amountBigInt === balanceBigInt) {
          if (balanceBigInt <= feeBigInt) {
            throw new HttpException('Insufficient balance to cover fees', HttpStatus.BAD_REQUEST);
          }
          amountToSend = balanceBigInt - feeBigInt;
        } else if (amountBigInt + feeBigInt > balanceBigInt) {
          throw new HttpException(
            'Insufficient balance to cover amount and fees',
            HttpStatus.BAD_REQUEST,
          );
        } else {
          amountToSend = amountBigInt - feeBigInt;
        }
      }

      await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
          internal({
            value: amountToSend,
            to: toAddress,
          }),
        ],
      });

      return { success: true };
    } catch (error) {
      throw new HttpException(
        'Withdrawal failed: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private encryptPrivateKey(privateKey: string): string {
    const algorithm = 'aes-256-cbc';
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    const hash = crypto.createHash('sha256');
    hash.update(key);
    const derivedKey = hash.digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptPrivateKey(encryptedPrivateKey: string): string {
    const algorithm = 'aes-256-cbc';
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    const hash = crypto.createHash('sha256');
    hash.update(key);
    const derivedKey = hash.digest();
    const [ivHex, encryptedHex] = encryptedPrivateKey.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private async initTonClient() {
    const endpoint = await getHttpV4Endpoint();
    this.tonClient = new TonClient4({ endpoint });
  }
}
