import { Pool } from 'pg';
import { config } from '../config';

const isTest = config.nodeEnv === 'test';

export const pool = new Pool({
  connectionString: isTest ? config.databaseTestUrl : config.databaseUrl,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
