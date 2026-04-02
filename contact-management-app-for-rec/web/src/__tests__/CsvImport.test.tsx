import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CsvImport } from '../components/csv/CsvImport';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: 'mock-token', user: null, login: vi.fn(), logout: vi.fn(), isAuthenticated: true }),
}));

// Mock importContacts so the modal result renders without a real network call
vi.mock('../api/contacts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/contacts')>();
  return {
    ...original,
    importContacts: vi.fn().mockResolvedValue({ imported: 3, skipped: 1, errors: [] }),
  };
});

function renderImport() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CsvImport />
    </QueryClientProvider>
  );
}

describe('CsvImport', () => {
  it('renders the import button', () => {
    renderImport();
    expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
  });

  it('has a hidden file input that accepts .csv', () => {
    renderImport();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toBe('.csv');
  });

  it('shows import summary modal after successful upload', async () => {
    renderImport();
    const user = userEvent.setup();
    const csvContent = 'name,email\nAlice,alice@example.com';
    const file = new File([csvContent], 'contacts.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      const importedText = screen.queryByText(/imported/i) || screen.queryByText(/complete/i);
      expect(importedText).toBeTruthy();
    }, { timeout: 5000 });
  });
});
