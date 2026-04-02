import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:changeme@localhost:5432/contacts',
  databaseTestUrl: process.env.DATABASE_TEST_URL || 'postgres://postgres:changeme@localhost:5432/contacts_test',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-minimum-32-chars',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
};
