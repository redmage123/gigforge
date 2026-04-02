import request from 'supertest';
import { createApp } from '../src/app';
import { setupTestDb, cleanDb, seedTestUser, closePool } from './setup';

const app = createApp();

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await setupTestDb();
});

beforeEach(async () => {
  await cleanDb();
  await seedTestUser('admin@test.com', 'password123', 'Admin User');
});

afterAll(async () => {
  await closePool();
});

describe('POST /api/v1/auth/register', () => {
  it('returns 201 and a token when registering a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'newuser@test.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user.email).toBe('newuser@test.com');
    expect(res.body.error).toBeNull();
  });

  it('returns 409 when email is already taken', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'admin@test.com', password: 'password123', name: 'Duplicate' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeTruthy();
    expect(res.body.data).toBeNull();
  });

  it('returns 422 with missing name', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'x@test.com', password: 'password123' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 422 when password is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'x@test.com', password: 'short', name: 'Test' });

    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty('password');
  });

  it('returns 422 with invalid email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'password123', name: 'Test' });

    expect(res.status).toBe(422);
  });

  it('returns 403 when the 5-user limit is reached', async () => {
    // Seed 4 more users to reach MAX_USERS (5) — already have admin@test.com from beforeEach
    for (let i = 1; i <= 4; i++) {
      await seedTestUser(`user${i}@test.com`, 'password123', `User ${i}`);
    }

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'sixth@test.com', password: 'password123', name: 'Sixth User' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/maximum/i);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 and a token with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user.email).toBe('admin@test.com');
    expect(res.body.error).toBeNull();
  });

  it('returns 401 with invalid password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
    expect(res.body.data).toBeNull();
  });

  it('returns 401 with unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 422 with missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com' });

    expect(res.status).toBe(422);
  });

  it('does not expose whether email exists (same error for bad email vs bad password)', async () => {
    const resBadEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    const resBadPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' });

    expect(resBadEmail.status).toBe(resBadPassword.status);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 200 and blacklists the token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    const { token } = loginRes.body.data;

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);

    // Token should now be rejected
    const protectedRes = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`);
    expect(protectedRes.status).toBe(401);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });
});
