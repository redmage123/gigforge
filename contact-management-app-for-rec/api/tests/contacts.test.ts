import request from 'supertest';
import { createApp } from '../src/app';
import { setupTestDb, cleanDb, seedTestUser, seedTestContact, closePool } from './setup';

const app = createApp();
let token: string;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await setupTestDb();
});

beforeEach(async () => {
  await cleanDb();
  await seedTestUser();
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'test@example.com', password: 'testpass123' });
  token = loginRes.body.data.token;
});

afterAll(async () => {
  await closePool();
});

describe('GET /api/v1/contacts', () => {
  it('returns paginated contacts', async () => {
    await seedTestContact({ name: 'Bob Jones', email: 'bob@example.com' });
    await seedTestContact({ name: 'Carol Smith', email: 'carol@example.com' });

    const res = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/contacts');
    expect(res.status).toBe(401);
  });

  it('returns empty list when no contacts', async () => {
    const res = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await seedTestContact({ name: `Person ${i}`, email: `person${i}@example.com`, company: `Corp ${i}` });
    }

    const res = await request(app)
      .get('/api/v1/contacts?page=1&limit=3')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.limit).toBe(3);
  });
});

describe('GET /api/v1/contacts/:id', () => {
  it('returns a single contact with tags', async () => {
    const contact = await seedTestContact();

    const res = await request(app)
      .get(`/api/v1/contacts/${contact.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(contact.id);
    expect(res.body.data.name).toBe(contact.name);
    expect(res.body.data.tags).toBeInstanceOf(Array);
  });

  it('returns 404 for unknown contact', async () => {
    const res = await request(app)
      .get('/api/v1/contacts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/contacts', () => {
  it('creates a contact with required fields', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Baker', email: 'jordan@example.com', company: 'StartupCo' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Jordan Baker');
    expect(res.body.data.email).toBe('jordan@example.com');
    expect(res.body.data.tags).toEqual([]);
  });

  it('returns 422 when name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'noname@example.com' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 422 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', email: 'not-an-email' });

    expect(res.status).toBe(422);
  });

  it('creates contact with tags', async () => {
    // Get system tag id
    const tagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);
    const candidateTag = tagsRes.body.data.find((t: { name: string }) => t.name === 'candidate');

    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tagged Person', tagIds: [candidateTag.id] });

    expect(res.status).toBe(201);
    expect(res.body.data.tags).toHaveLength(1);
    expect(res.body.data.tags[0].name).toBe('candidate');
  });
});

describe('PUT /api/v1/contacts/:id', () => {
  it('updates a contact', async () => {
    const contact = await seedTestContact();

    const res = await request(app)
      .put(`/api/v1/contacts/${contact.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', company: 'NewCo' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
    expect(res.body.data.company).toBe('NewCo');
  });

  it('returns 404 for unknown contact', async () => {
    const res = await request(app)
      .put('/api/v1/contacts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Someone' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/contacts/:id', () => {
  it('deletes a contact', async () => {
    const contact = await seedTestContact();

    const deleteRes = await request(app)
      .delete(`/api/v1/contacts/${contact.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/v1/contacts/${contact.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(404);
  });

  it('returns 404 for unknown contact', async () => {
    const res = await request(app)
      .delete('/api/v1/contacts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
