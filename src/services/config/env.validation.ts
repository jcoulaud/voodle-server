import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4001),

  DATABASE_HOST: z.string().default('127.0.0.1'),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_NAME: z.string().min(1),

  // Application URL
  BASE_URL: z.string().url(),

  // API Keys
  RESEND_API_KEY: z.string().min(1),
  TON_API_KEY: z.string().min(1),

  // JWT Configuration
  JWT_SECRET: z.string().min(64),
  JWT_REFRESH_SECRET: z.string().min(64),

  // Wallet encryption
  ENCRYPTION_KEY: z.string().min(64),

  // TON recipient wallet for fees
  FEE_RECIPIENT_WALLET: z.string().length(48),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateConfig(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    console.error(
      '❌ Invalid environment variables:',
      JSON.stringify(result.error.format(), null, 4),
    );
    process.exit(1);
  }
  return result.data;
}
