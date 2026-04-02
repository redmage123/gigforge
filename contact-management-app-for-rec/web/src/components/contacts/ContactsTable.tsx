import React from 'react';
import { Contact } from '../../types';
import { TagBadge } from '../tags/TagBadge';
import { ContactRowSkeleton } from '../ui/Skeleton';
import { Pencil, Trash2, Eye } from 'lucide-react';
import { formatDate } from '../../utils/formatters';

interface ContactsTableProps {
  contacts: Contact[];
  loading?: boolean;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onView: (contact: Contact) => void;
}

export function ContactsTable({ contacts, loading, onEdit, onDelete, onView }: ContactsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" role="table">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Name</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Email</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 hidden md:table-cell">Company</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Tags</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 hidden lg:table-cell">Added</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 5 }).map((_, i) => <ContactRowSkeleton key={i} />)}
          {!loading && contacts.map(contact => (
            <tr
              key={contact.id}
              className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <td className="px-4 py-3">
                <button
                  onClick={() => onView(contact)}
                  className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left"
                >
                  {contact.name}
                </button>
              </td>
              <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{contact.email || '—'}</td>
              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{contact.company || '—'}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {contact.tags.slice(0, 3).map(t => <TagBadge key={t.id} tag={t} />)}
                  {contact.tags.length > 3 && (
                    <span className="text-xs text-gray-400">+{contact.tags.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                {formatDate(contact.created_at)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onView(contact)}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    aria-label={`View ${contact.name}`}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => onEdit(contact)}
                    className="p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                    aria-label={`Edit ${contact.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => onDelete(contact)}
                    className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                    aria-label={`Delete ${contact.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
