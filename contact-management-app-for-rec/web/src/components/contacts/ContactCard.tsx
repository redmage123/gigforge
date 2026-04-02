import React from 'react';
import { Contact } from '../../types';
import { TagBadge } from '../tags/TagBadge';
import { ContactCardSkeleton } from '../ui/Skeleton';
import { Pencil, Trash2 } from 'lucide-react';
import { getInitials } from '../../utils/formatters';

interface ContactCardProps {
  contacts: Contact[];
  loading?: boolean;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onView: (contact: Contact) => void;
}

export function ContactCard({ contacts, loading, onEdit, onDelete, onView }: ContactCardProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => <ContactCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-4">
      {contacts.map(contact => (
        <div
          key={contact.id}
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900"
        >
          <div className="flex items-start justify-between gap-3">
            <button onClick={() => onView(contact)} className="flex items-center gap-3 flex-1 text-left">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {getInitials(contact.name)}
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{contact.name}</p>
                {contact.email && <p className="text-sm text-gray-500 dark:text-gray-400">{contact.email}</p>}
                {contact.company && <p className="text-sm text-gray-400">{contact.company}</p>}
              </div>
            </button>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => onEdit(contact)}
                className="p-1.5 rounded text-gray-400 hover:text-blue-600"
                aria-label={`Edit ${contact.name}`}
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => onDelete(contact)}
                className="p-1.5 rounded text-gray-400 hover:text-red-600"
                aria-label={`Delete ${contact.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          {contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {contact.tags.map(t => <TagBadge key={t.id} tag={t} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
