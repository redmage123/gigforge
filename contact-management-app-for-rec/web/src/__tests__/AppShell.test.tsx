import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'admin@gigforge.ai', name: 'Demo Admin', created_at: new Date() },
    token: 'mock-token',
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
  }),
}));

describe('AppShell', () => {
  it('renders the sidebar on desktop', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div data-testid="content">Content</div>
        </AppShell>
      </MemoryRouter>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Content</div>
        </AppShell>
      </MemoryRouter>
    );
    // Sidebar + mobile nav both render "Contacts" links
    expect(screen.getAllByText(/contacts/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the dark mode toggle', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Content</div>
        </AppShell>
      </MemoryRouter>
    );
    const toggles = screen.getAllByRole('button', { name: /dark mode|light mode/i });
    expect(toggles.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the logout button', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Content</div>
        </AppShell>
      </MemoryRouter>
    );
    // Sidebar (desktop) + MobileNav both render logout buttons
    expect(screen.getAllByRole('button', { name: /log out/i }).length).toBeGreaterThanOrEqual(1);
  });
});
