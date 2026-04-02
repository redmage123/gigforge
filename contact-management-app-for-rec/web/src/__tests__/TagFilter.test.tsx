import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TagFilter } from '../components/contacts/TagFilter';

// TagFilter uses useTags hook — mocked via MSW handlers in setup.ts
function renderTagFilter(selectedTag = '', onTagChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TagFilter selectedTag={selectedTag} onTagChange={onTagChange} />
    </QueryClientProvider>
  );
}

describe('TagFilter', () => {
  it('renders the filter select/combobox', () => {
    renderTagFilter();
    const select = screen.queryByRole('combobox') || screen.queryByRole('listbox') || screen.queryByLabelText(/filter/i);
    expect(select).toBeInTheDocument();
  });

  it('calls onTagChange when a tag is selected', async () => {
    const onTagChange = vi.fn();
    renderTagFilter('', onTagChange);
    const user = userEvent.setup();
    // Wait for tags to load from MSW before trying to select
    await waitFor(() => {
      expect(screen.getByText('candidate')).toBeInTheDocument();
    }, { timeout: 3000 });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await user.selectOptions(select, 'candidate');
    expect(onTagChange).toHaveBeenCalledWith('candidate');
  });

  it('shows "All tags" as default option', () => {
    renderTagFilter();
    expect(screen.getByText(/all tags/i)).toBeInTheDocument();
  });
});
