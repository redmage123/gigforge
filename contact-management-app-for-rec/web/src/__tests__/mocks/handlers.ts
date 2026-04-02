import { http, HttpResponse } from 'msw';
import { mockContacts, mockTags, mockPagination, mockUser } from './data';

const BASE = '/api/v1';

export const handlers = [
  // Auth
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    if (body.email === 'admin@gigforge.ai' && body.password === 'demo1234') {
      return HttpResponse.json({ data: { token: 'mock-token-abc', user: mockUser }, error: null });
    }
    return HttpResponse.json({ data: null, error: 'Invalid credentials' }, { status: 401 });
  }),

  http.post(`${BASE}/auth/logout`, () => {
    return HttpResponse.json({ data: { message: 'Logged out' }, error: null });
  }),

  // Contacts
  http.get(`${BASE}/contacts`, () => {
    return HttpResponse.json({ data: mockContacts, error: null, pagination: mockPagination });
  }),

  http.get(`${BASE}/contacts/export`, () => {
    const csv = 'name,email,phone,company,tags\nJordan Baker,jordan@example.com,555-1234,StartupCo,candidate';
    return new HttpResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="contacts.csv"',
      },
    });
  }),

  http.get(`${BASE}/contacts/:id`, ({ params }) => {
    const contact = mockContacts.find(c => c.id === params.id);
    if (!contact) {
      return HttpResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json({ data: contact, error: null });
  }),

  http.post(`${BASE}/contacts`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    if (!body.name) {
      return HttpResponse.json(
        { data: null, error: 'Validation failed', fields: { name: 'Required' } },
        { status: 422 }
      );
    }
    const newContact = { ...body, id: 'c-new', tags: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    return HttpResponse.json({ data: newContact, error: null }, { status: 201 });
  }),

  http.put(`${BASE}/contacts/:id`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const contact = mockContacts.find(c => c.id === params.id);
    if (!contact) {
      return HttpResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json({ data: { ...contact, ...body }, error: null });
  }),

  http.delete(`${BASE}/contacts/:id`, ({ params }) => {
    const contact = mockContacts.find(c => c.id === params.id);
    if (!contact) {
      return HttpResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/contacts/import`, () => {
    return HttpResponse.json({ data: { imported: 3, skipped: 0, errors: [] }, error: null });
  }),

  http.post(`${BASE}/contacts/:id/tags`, () => {
    return HttpResponse.json({ data: mockContacts[0], error: null });
  }),

  http.delete(`${BASE}/contacts/:id/tags/:tagId`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Tags
  http.get(`${BASE}/tags`, () => {
    return HttpResponse.json({ data: mockTags, error: null });
  }),

  http.post(`${BASE}/tags`, async ({ request }) => {
    const body = await request.json() as { name: string; colour?: string };
    if (!body.name) {
      return HttpResponse.json({ data: null, error: 'Validation failed' }, { status: 422 });
    }
    const newTag = { id: 'tag-new', name: body.name, colour: body.colour ?? '#6366F1', is_system: false, created_at: new Date().toISOString() };
    return HttpResponse.json({ data: newTag, error: null }, { status: 201 });
  }),

  http.delete(`${BASE}/tags/:id`, ({ params }) => {
    const tag = mockTags.find(t => t.id === params.id);
    if (!tag) return HttpResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    if (tag.is_system) return HttpResponse.json({ data: null, error: 'Cannot delete system tag' }, { status: 403 });
    return new HttpResponse(null, { status: 204 });
  }),

  // Health
  http.get(`${BASE}/health`, () => {
    return HttpResponse.json({ data: { status: 'ok', uptime: 1234 }, error: null });
  }),
];
