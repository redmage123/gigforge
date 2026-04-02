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

  await seedTestContact({ name: 'Sarah Johnson', email: 'sarah@techrecruit.com', company: 'TechRecruit Ltd' });
  await seedTestContact({ name: 'Alex Jones', email: 'alex@example.com', company: 'DesignCo' });
  await seedTestContact({ name: 'Bob Williams', email: 'bob@startupco.com', company: 'StartupCo' });
});

afterAll(async () => {
  await closePool();
});

describe('Full-text search', () => {
  it('finds contacts by name', async () => {
    const res = await request(app)
      .get('/api/v1/contacts?q=sarah')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].name).toBe('Sarah Johnson');
  });

  it('finds contacts by email', async () => {
    const res = await request(app)
      .get('/api/v1/contacts?q=techrecruit')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('finds contacts by company', async () => {
    const res = await request(app)
      .get('/api/v1/contacts?q=startupco')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((c: { company: string }) => c.company === 'StartupCo')).toBe(true);
  });

  it('returns empty array for no matches', async () => {
    const res = await request(app)
      .get('/api/v1/contacts?q=zzznomatch99xyz')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('returns all contacts when search is empty', async () => {
    const res = await request(app)
      .get('/api/v1/contacts?q=')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(3);
  });
});

describe('Tag filtering', () => {
  it('filters contacts by tag name', async () => {
    const contactRes = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`);
    const contact = contactRes.body.data[0];

    const tagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);
    const candidateTag = tagsRes.body.data.find((t: { name: string }) => t.name === 'candidate');

    await request(app)
      .post(`/api/v1/contacts/${contact.id}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tagId: candidateTag.id });

    const filterRes = await request(app)
      .get('/api/v1/contacts?tag=candidate')
      .set('Authorization', `Bearer ${token}`);

    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data.some((c: { id: string }) => c.id === contact.id)).toBe(true);
  });

  it('returns empty when no contacts match the tag', async () => {
    const res = await request(app)
      .get('/api/v1/contacts?tag=placed')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('Sorting', () => {
  it('sorts by name ascending', async () => {
    const res = await request(app)
      .get('/api/v1/contacts?sortBy=name&sortOrder=asc')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((c: { name: string }) => c.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('sorts by name descending', async () => {
    const res = await request(app)
      .get('/api/v1/contacts?sortBy=name&sortOrder=desc')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((c: { name: string }) => c.name);
    const sorted = [...names].sort().reverse();
    expect(names).toEqual(sorted);
  });

  it('defaults to created_at descending', async () => {
    const res = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const dates = res.body.data.map((c: { created_at: string }) => new Date(c.created_at).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });
});

describe('Combined search + tag filter', () => {
  it('applies both search and tag filter simultaneously', async () => {
    const contactRes = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`);
    const sarah = contactRes.body.data.find((c: { name: string }) => c.name === 'Sarah Johnson');

    const tagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);
    const candidateTag = tagsRes.body.data.find((t: { name: string }) => t.name === 'candidate');

    await request(app)
      .post(`/api/v1/contacts/${sarah.id}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tagId: candidateTag.id });

    const res = await request(app)
      .get('/api/v1/contacts?q=sarah&tag=candidate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((c: { id: string }) => c.id === sarah.id)).toBe(true);

    // Alex Jones should not appear (no candidate tag)
    const alexRes = await request(app)
      .get('/api/v1/contacts?q=alex&tag=candidate')
      .set('Authorization', `Bearer ${token}`);
    expect(alexRes.body.data).toEqual([]);
  });
});
