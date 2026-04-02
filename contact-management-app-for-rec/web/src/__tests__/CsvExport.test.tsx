import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CsvExport } from '../components/csv/CsvExport';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: 'mock-token', user: null, login: vi.fn(), logout: vi.fn(), isAuthenticated: true }),
}));

// exportContacts uses URL.createObjectURL which doesn't exist in Node/jsdom — mock at API level
vi.mock('../api/contacts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/contacts')>();
  return { ...original, exportContacts: vi.fn().mockResolvedValue(undefined) };
});

function renderExport() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CsvExport />
    </QueryClientProvider>
  );
}

describe('CsvExport', () => {
  it('renders the export button', () => {
    renderExport();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('button is not disabled initially', () => {
    renderExport();
    const btn = screen.getByRole('button', { name: /export/i });
    expect(btn).not.toBeDisabled();
  });

  it('does not crash on click', async () => {
    renderExport();
    const user = userEvent.setup();
    // exportContacts is mocked — click should not throw
    await user.click(screen.getByRole('button', { name: /export/i }));
    // No assertion needed — test just ensures no unhandled exception
  });
});
