export const env = {
  JWT_SECRET: process.env.JWT_SECRET ?? 'default-dev-secret-change-in-production',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/todo_api',
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '24h',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10),
}
