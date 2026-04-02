import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { config } from '../config';
import { User } from '../types';

// In-memory token blacklist (acceptable for dev; persist to DB/Redis for production)
export const tokenBlacklist = new Set<string>();

const MAX_USERS = 5;

export class RegistrationError extends Error {
  constructor(
    message: string,
    public readonly code: 'MAX_USERS_REACHED' | 'EMAIL_TAKEN'
  ) {
    super(message);
    this.name = 'RegistrationError';
  }
}

export async function registerUser(
  email: string,
  password: string,
  name: string
): Promise<{ token: string; user: User }> {
  const { rows: countRows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) FROM users'
  );
  if (parseInt(countRows[0].count, 10) >= MAX_USERS) {
    throw new RegistrationError(
      `Maximum of ${MAX_USERS} users allowed. Contact your administrator.`,
      'MAX_USERS_REACHED'
    );
  }

  const { rows: existing } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (existing.length > 0) {
    throw new RegistrationError('A user with this email already exists.', 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query<{ id: string; email: string; name: string; created_at: Date }>(
    `INSERT INTO users (id, email, password_hash, name)
     VALUES (gen_random_uuid(), $1, $2, $3)
     RETURNING id, email, name, created_at`,
    [email, passwordHash, name]
  );

  const user: User = rows[0];
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry as jwt.SignOptions['expiresIn'] }
  );

  return { token, user };
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: User } | null> {
  const { rows } = await pool.query<{ id: string; email: string; name: string; password_hash: string; created_at: Date }>(
    'SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1',
    [email]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;

  const user: User = { id: row.id, email: row.email, name: row.name, created_at: row.created_at };

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry as jwt.SignOptions['expiresIn'] }
  );

  return { token, user };
}

export function logoutUser(token: string): void {
  tokenBlacklist.add(token);
}
