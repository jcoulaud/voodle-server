import BigNumber from 'bignumber.js';
import chalk from 'chalk';
import { format } from 'date-fns';

/**
 * Logger method
 * @param message The message to write
 * @returns The message
 */

type Logger = {
  info: (message: string) => void;
  success: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
  tokenInfo: (address: string, message: string) => void;
  newBlock: (message: string) => void;
  separator: () => void;
};

export const logger: Logger = {
  info: (message: string) => console.log(chalk.blue(`[INFO] ${message}`)),
  success: (message: string) => console.log(chalk.green(`[SUCCESS] ${message}`)),
  warning: (message: string) => console.log(chalk.yellow(`[WARNING] ${message}`)),
  error: (message: string) => console.log(chalk.red(`[ERROR] ${message}`)),
  tokenInfo: (address: string, message: string) =>
    console.log(chalk.cyan(`[TOKEN ${address}] ${message}`)),
  newBlock: (message: string) => console.log(chalk.cyan(message)),
  separator: () => console.log(chalk.gray('-'.repeat(67))),
};

/**
 * Sleep for a given number of milliseconds
 * @param ms The number of milliseconds to sleep
 * @returns A promise that resolves after the specified number of milliseconds
 */

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get the current date in the format MM/dd/yyyy pp
 * @returns The current date in the format MM/dd/yyyy pp
 */

export const getDate = () => format(new Date(), 'MM/dd/yyyy pp');

/**
 * Normalize token amount to human-readable format
 * @param amount The amount to normalize
 * @param decimals The number of decimals the token has
 * @returns Normalized amount as BigNumber
 */
export const normalizeTokenAmount = (
  amount: string | number | bigint,
  decimals: number | string,
): BigNumber => {
  const amountBN = new BigNumber(amount.toString());
  const divisor = new BigNumber(10).pow(Number(decimals));
  return amountBN.dividedBy(divisor);
};

/**
 * Denormalize token amount from human-readable format to raw token units
 * @param amount The amount to denormalize
 * @param decimals The number of decimals the token has
 * @returns Denormalized amount as BigNumber
 */
export const denormalizeTokenAmount = (
  amount: string | number | BigNumber,
  decimals: number | string,
): BigNumber => {
  const amountBN = new BigNumber(amount.toString());
  const multiplier = new BigNumber(10).pow(Number(decimals));
  return amountBN.multipliedBy(multiplier);
};

/**
 * Parse amount from Dedust payload
 * @param payload The payload to parse
 * @param field The field to extract
 * @returns Parsed amount as string
 */
export const parseDedustAmount = (payload: string, field: string): string => {
  const match = payload.match(new RegExp(`${field}: "([\\d]+)"`));
  return match ? match[1] : '0';
};
