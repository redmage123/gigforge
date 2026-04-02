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

describe('GET /api/v1/tags', () => {
  it('returns all tags including system tags', async () => {
    const res = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    const names = res.body.data.map((t: { name: string }) => t.name);
    expect(names).toContain('candidate');
    expect(names).toContain('client');
    expect(names).toContain('warm lead');
    expect(names).toContain('placed');
    expect(names).toContain('interviewed');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/tags');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/tags', () => {
  it('creates a custom tag', async () => {
    const res = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'senior developer', colour: '#FF5733' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('senior developer');
    expect(res.body.data.colour).toBe('#FF5733');
    expect(res.body.data.is_system).toBe(false);
  });

  it('assigns default colour when not specified', async () => {
    const res = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'no-colour-tag' });

    expect(res.status).toBe(201);
    expect(res.body.data.colour).toBeTruthy();
  });

  it('returns 409 for duplicate tag name', async () => {
    await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'unique-tag' });

    const res = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'unique-tag' });

    expect(res.status).toBe(409);
  });

  it('returns 409 when duplicating a system tag name', async () => {
    const res = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'candidate' });

    expect(res.status).toBe(409);
  });

  it('returns 422 when name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ colour: '#000000' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/tags/:id', () => {
  it('deletes a custom tag', async () => {
    const createRes = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'deletable-tag' });
    const tagId = createRes.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/tags/${tagId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(204);
  });

  it('returns 403 when trying to delete a system tag', async () => {
    const tagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);
    const systemTag = tagsRes.body.data.find((t: { is_system: boolean }) => t.is_system);

    const res = await request(app)
      .delete(`/api/v1/tags/${systemTag.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/contacts/:id/tags', () => {
  it('assigns a tag to a contact', async () => {
    const contact = await seedTestContact();
    const tagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);
    const tag = tagsRes.body.data[0];

    const res = await request(app)
      .post(`/api/v1/contacts/${contact.id}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tagId: tag.id });

    expect(res.status).toBe(200);

    const contactRes = await request(app)
      .get(`/api/v1/contacts/${contact.id}`)
      .set('Authorization', `Bearer ${token}`);
    const tagIds = contactRes.body.data.tags.map((t: { id: string }) => t.id);
    expect(tagIds).toContain(tag.id);
  });

  it('is idempotent - assigning same tag twice does not duplicate', async () => {
    const contact = await seedTestContact();
    const tagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);
    const tag = tagsRes.body.data[0];

    await request(app)
      .post(`/api/v1/contacts/${contact.id}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tagId: tag.id });

    await request(app)
      .post(`/api/v1/contacts/${contact.id}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tagId: tag.id });

    const contactRes = await request(app)
      .get(`/api/v1/contacts/${contact.id}`)
      .set('Authorization', `Bearer ${token}`);
    const tagIds = contactRes.body.data.tags.map((t: { id: string }) => t.id);
    const count = tagIds.filter((id: string) => id === tag.id).length;
    expect(count).toBe(1);
  });
});

describe('DELETE /api/v1/contacts/:id/tags/:tagId', () => {
  it('removes a tag from a contact', async () => {
    const contact = await seedTestContact();
    const tagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);
    const tag = tagsRes.body.data[0];

    await request(app)
      .post(`/api/v1/contacts/${contact.id}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tagId: tag.id });

    const removeRes = await request(app)
      .delete(`/api/v1/contacts/${contact.id}/tags/${tag.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(removeRes.status).toBe(204);

    const contactRes = await request(app)
      .get(`/api/v1/contacts/${contact.id}`)
      .set('Authorization', `Bearer ${token}`);
    const tagIds = contactRes.body.data.tags.map((t: { id: string }) => t.id);
    expect(tagIds).not.toContain(tag.id);
  });
});
