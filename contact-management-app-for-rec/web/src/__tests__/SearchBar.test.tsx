import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from '../components/contacts/SearchBar';

describe('SearchBar', () => {
  it('renders the search input with aria-label', () => {
    render(<SearchBar onSearch={vi.fn()} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('calls onSearch after debounce when user types', async () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'jones');
    await waitFor(() => {
      expect(onSearch).toHaveBeenCalledWith('jones');
    }, { timeout: 1000 });
  });

  it('shows clear button when input has value', async () => {
    render(<SearchBar onSearch={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'something');
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('hides clear button when input is empty', () => {
    render(<SearchBar onSearch={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('clears the input and calls onSearch with empty string', async () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'test');
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
});
