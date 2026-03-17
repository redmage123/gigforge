export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/saas_billing',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? 'sk_test_mock',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_mock',
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
  DB_POOL_IDLE_TIMEOUT_MS: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? '30000', 10),
  DB_POOL_CONNECTION_TIMEOUT_MS: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? '2000', 10),
} as const
