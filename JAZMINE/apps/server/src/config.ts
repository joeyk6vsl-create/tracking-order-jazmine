import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';

export interface AppConfig {
  production: boolean;
  port: number;
  origin: string;
  dataDir: string;
  databaseUrl?: string;
  localRecoveryRoot?: string;
  recoveryMode?: boolean;
}
export function readConfig(): AppConfig {
  const env = z
    .object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      PORT: z.coerce.number().int().min(1).max(65535).default(3100),
      WEB_ORIGIN: z.url().default('http://localhost:5173'),
      LOCAL_DATA_DIR: z.string().default('./local-data/postgres'),
      DATABASE_URL: z.string().optional(),
      LOCAL_RECOVERY_ROOT: z.string().optional(),
      JAZMINE_RECOVERY_MODE: z.enum(['0', '1']).optional(),
    })
    .parse(process.env);
  const production = env.NODE_ENV === 'production';
  if (production && (!env.DATABASE_URL || !env.WEB_ORIGIN.startsWith('https://')))
    throw new Error('Production requires DATABASE_URL and HTTPS WEB_ORIGIN');
  return {
    production,
    port: env.PORT,
    origin: new URL(env.WEB_ORIGIN).origin,
    dataDir: resolve(env.LOCAL_DATA_DIR),
    databaseUrl: env.DATABASE_URL,
    localRecoveryRoot: env.LOCAL_RECOVERY_ROOT,
    recoveryMode: env.JAZMINE_RECOVERY_MODE === '1',
  };
}
