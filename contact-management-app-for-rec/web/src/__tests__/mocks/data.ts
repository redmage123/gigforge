export const mockTags = [
  { id: 'tag-1', name: 'candidate', colour: '#3B82F6', is_system: true, created_at: '2026-03-21T00:00:00Z' },
  { id: 'tag-2', name: 'client', colour: '#10B981', is_system: true, created_at: '2026-03-21T00:00:00Z' },
  { id: 'tag-3', name: 'warm lead', colour: '#F59E0B', is_system: true, created_at: '2026-03-21T00:00:00Z' },
  { id: 'tag-4', name: 'placed', colour: '#8B5CF6', is_system: true, created_at: '2026-03-21T00:00:00Z' },
  { id: 'tag-5', name: 'interviewed', colour: '#6B7280', is_system: true, created_at: '2026-03-21T00:00:00Z' },
];

export const mockContacts = [
  {
    id: 'c-1',
    name: 'Jordan Baker',
    email: 'jordan@example.com',
    phone: '555-1234',
    company: 'StartupCo',
    notes: 'Great candidate',
    created_at: '2026-03-21T10:00:00Z',
    updated_at: '2026-03-21T10:00:00Z',
    tags: [mockTags[0]],
  },
  {
    id: 'c-2',
    name: 'Sarah Chen',
    email: 'sarah@techrecruit.com',
    phone: '555-5678',
    company: 'TechRecruit Ltd',
    notes: '',
    created_at: '2026-03-21T09:00:00Z',
    updated_at: '2026-03-21T09:00:00Z',
    tags: [mockTags[1], mockTags[3]],
  },
];

export const mockPagination = {
  page: 1,
  limit: 25,
  total: 2,
  pages: 1,
};

export const mockUser = {
  id: 'user-1',
  email: 'admin@gigforge.ai',
  name: 'Demo Admin',
  created_at: '2026-03-21T00:00:00Z',
};
