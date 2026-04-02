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

describe('POST /api/v1/contacts/import', () => {
  it('imports valid CSV rows', async () => {
    const csv = `name,email,phone,company,tags
Alice Smith,alice@example.com,555-0001,Acme Corp,"candidate,warm lead"
Bob Jones,bob@example.com,555-0002,BobCo,client
Carol White,carol@example.com,,StartupCo,`;

    const res = await request(app)
      .post('/api/v1/contacts/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), { filename: 'contacts.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(3);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.errors).toHaveLength(0);
  });

  it('skips rows missing name and reports them in errors', async () => {
    const csv = `name,email,phone,company,tags
Alice Smith,alice@example.com,,,
,noname@example.com,,,
Bob Jones,bob@example.com,,,`;

    const res = await request(app)
      .post('/api/v1/contacts/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), { filename: 'contacts.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.errors).toHaveLength(1);
    expect(res.body.data.errors[0].reason).toMatch(/name/i);
  });

  it('returns 400 when no file is provided', async () => {
    const res = await request(app)
      .post('/api/v1/contacts/import')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/v1/contacts/import')
      .attach('file', Buffer.from('name,email\ntest,test@test.com'), {
        filename: 'contacts.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(401);
  });

  it('handles CSV with only headers (empty import)', async () => {
    const csv = `name,email,phone,company,tags`;

    const res = await request(app)
      .post('/api/v1/contacts/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), { filename: 'contacts.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(0);
  });

  it('imported contacts appear in the contact list', async () => {
    const csv = `name,email,phone,company,tags
Imported Person,imported@example.com,,,`;

    await request(app)
      .post('/api/v1/contacts/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), { filename: 'contacts.csv', contentType: 'text/csv' });

    const listRes = await request(app)
      .get('/api/v1/contacts?q=imported')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.body.data.some((c: { name: string }) => c.name === 'Imported Person')).toBe(true);
  });
});

describe('GET /api/v1/contacts/export', () => {
  it('downloads a CSV file with correct headers', async () => {
    await seedTestContact({ name: 'Export Test', email: 'export@example.com', company: 'ExportCo' });

    const res = await request(app)
      .get('/api/v1/contacts/export')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/contacts\.csv/);
    expect(res.text).toContain('name,email,phone,company,tags');
    expect(res.text).toContain('Export Test');
  });

  it('exports empty database as CSV with only headers', async () => {
    const res = await request(app)
      .get('/api/v1/contacts/export')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('name');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/contacts/export');
    expect(res.status).toBe(401);
  });

  it('includes tags in export', async () => {
    const contact = await seedTestContact({ name: 'Tagged Export', email: 'tagged@example.com' });
    const tagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);
    const candidateTag = tagsRes.body.data.find((t: { name: string }) => t.name === 'candidate');

    await request(app)
      .post(`/api/v1/contacts/${contact.id}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tagId: candidateTag.id });

    const res = await request(app)
      .get('/api/v1/contacts/export')
      .set('Authorization', `Bearer ${token}`);

    expect(res.text).toContain('candidate');
  });
});
