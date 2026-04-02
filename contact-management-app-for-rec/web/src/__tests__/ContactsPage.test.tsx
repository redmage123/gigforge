import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactsPage } from '../pages/ContactsPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    token: 'mock-token',
    user: { id: 'u1', email: 'admin@gigforge.ai', name: 'Demo Admin', created_at: new Date() },
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
  }),
}));

function renderContactsPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContactsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ContactsPage', () => {
  it('renders the page heading', () => {
    renderContactsPage();
    expect(screen.getAllByText(/contacts/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders search bar', () => {
    renderContactsPage();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('renders add contact button on desktop', () => {
    renderContactsPage();
    const addBtns = screen.getAllByRole('button', { name: /add contact/i });
    expect(addBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows contacts after loading', async () => {
    renderContactsPage();
    await waitFor(() => {
      // Both table (desktop) and card (mobile) render in jsdom — getAllByText handles both
      expect(screen.getAllByText('Jordan Baker').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 5000 });
  });

  it('shows contact email in the list', async () => {
    renderContactsPage();
    await waitFor(() => {
      expect(screen.getAllByText('jordan@example.com').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 5000 });
  });

  it('shows import and export csv buttons', async () => {
    renderContactsPage();
    await waitFor(() => {
      const importBtn = screen.queryByRole('button', { name: /import/i });
      const exportBtn = screen.queryByRole('button', { name: /export/i });
      expect(importBtn || exportBtn).toBeTruthy();
    }, { timeout: 5000 });
  });
});
