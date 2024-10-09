import { blockchainEnum } from '@/db/schema';

export type Blockchain = (typeof blockchainEnum.enumValues)[number];

export interface Wallet {
  id: number;
  user_id: number;
  blockchain: Blockchain;
  address: string;
  private_key: string;
  created_at: Date;
}
