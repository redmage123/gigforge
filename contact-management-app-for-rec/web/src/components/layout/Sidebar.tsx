import React from 'react';
import { NavLink } from 'react-router-dom';
import { Users, LogOut, Contact } from 'lucide-react';
import { DarkModeToggle } from '../ui/DarkModeToggle';
import { useAuth } from '../../hooks/useAuth';

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Contact size={22} className="text-blue-600" />
          <span className="font-bold text-gray-900 dark:text-white text-lg">ContactBase</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">Recruitment CRM</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4" aria-label="Main navigation">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`
          }
        >
          <Users size={18} />
          Contacts
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
          <div className="flex items-center gap-1">
            <DarkModeToggle />
            <button
              onClick={logout}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
