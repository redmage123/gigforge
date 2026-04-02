import React from 'react';
import { NavLink } from 'react-router-dom';
import { Users, LogOut, Contact } from 'lucide-react';
import { DarkModeToggle } from '../ui/DarkModeToggle';
import { useAuth } from '../../hooks/useAuth';

export function MobileNav() {
  const { logout } = useAuth();

  return (
    <>
      {/* Mobile topbar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Contact size={20} className="text-blue-600" />
          <span className="font-bold text-gray-900 dark:text-white">ContactBase</span>
        </div>
        <div className="flex items-center gap-1">
          <DarkModeToggle />
          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-500"
            aria-label="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 z-40" aria-label="Mobile navigation">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-2 flex-1 text-xs ${
              isActive ? 'text-blue-600' : 'text-gray-400'
            }`
          }
        >
          <Users size={20} />
          <span className="mt-0.5">Contacts</span>
        </NavLink>
      </nav>
    </>
  );
}
