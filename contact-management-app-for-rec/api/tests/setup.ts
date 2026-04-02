import fs from 'fs';
import path from 'path';
import pool from '../src/db';
import bcrypt from 'bcryptjs';

export async function setupTestDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '../src/db/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rows } = await client.query('SELECT id FROM _migrations WHERE filename = $1', [file]);
      if (rows.length === 0) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }
    }
  } finally {
    client.release();
  }
}

export async function cleanDb() {
  await pool.query('DELETE FROM contact_tags');
  await pool.query('DELETE FROM contacts');
  await pool.query('DELETE FROM tags WHERE is_system = false');
  await pool.query('DELETE FROM users');
}

export async function seedTestUser(
  email = 'test@example.com',
  password = process.env.TEST_USER_PASSWORD ?? 'testpass123',
  name = 'Test User'
) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO users (id, email, password_hash, name) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id, email, name, created_at',
    [email, hash, name]
  );
  return rows[0];
}

export async function seedTestContact(override: Record<string, unknown> = {}) {
  const defaults = {
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: '555-1234',
    company: 'Acme Corp',
    notes: 'Test note',
  };
  const data = { ...defaults, ...override };
  const { rows } = await pool.query(
    `INSERT INTO contacts (id, name, email, phone, company, notes)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING *`,
    [data.name, data.email, data.phone, data.company, data.notes]
  );
  return rows[0];
}

export async function closePool() {
  await pool.end();
}
