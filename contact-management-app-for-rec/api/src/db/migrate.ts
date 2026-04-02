import fs from 'fs';
import path from 'path';
import { pool } from './index';
import bcrypt from 'bcryptjs';

async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [file]
      );

      if (rows.length === 0) {
        console.log(`Running migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO _migrations (filename) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`  ✓ ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }
    }

    // Seed demo admin user if not exists (development only)
    const { rows: existing } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['admin@gigforge.ai']
    );
    if (existing.length === 0) {
      const hash = await bcrypt.hash('demo1234', 10);
      await client.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
        ['admin@gigforge.ai', hash, 'Demo Admin']
      );
      console.log('  ✓ Seeded demo admin user');
    }

    console.log('Migrations complete.');
  } finally {
    client.release();
  }
}

runMigrations()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
