import 'dotenv/config';
import { z } from 'zod';
const Schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_VERSION: z.string().default('0.1.0'),
  PUBLIC_APP_URL: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  PORT: z.coerce.number().default(3001),
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  DISCORD_BOT_TOKEN: z.string().default(''),
  DISCORD_REDIRECT_URI: z
    .url()
    .default('http://localhost:5173/api/v1/auth/discord/callback'),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  OWNER_USER_IDS: z.string().default(''),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  STORAGE_PATH: z.string().default('.data/private'),
  /** Per-client API request budget; dashboards poll delivery state, so keep headroom. */
  API_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(10)
    .max(100000)
    .default(300),
});
export function loadConfig() {
  const result = Schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      'Invalid environment variables: ' +
        result.error.issues
          .map((x) => x.path.join('.') + ': ' + x.message)
          .join('; '),
    );
  if (
    result.data.NODE_ENV === 'production' &&
    !result.data.PUBLIC_APP_URL.startsWith('https://')
  )
    throw new Error('PUBLIC_APP_URL must use HTTPS in production');
  return result.data;
}
export type Config = z.infer<typeof Schema>;
