import React from 'react';
import { Contact } from '../../types';
import { Drawer } from '../ui/Drawer';
import { TagBadge } from '../tags/TagBadge';
import { Button } from '../ui/Button';
import { Mail, Phone, Building2, FileText, Pencil } from 'lucide-react';
import { formatDate } from '../../utils/formatters';

interface ContactDetailProps {
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export function ContactDetail({ contact, open, onClose, onEdit }: ContactDetailProps) {
  if (!contact) return null;

  return (
    <Drawer open={open} onClose={onClose} title={contact.name}>
      <div className="space-y-6">
        <div className="space-y-3">
          {contact.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail size={16} className="text-gray-400 flex-shrink-0" />
              <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone size={16} className="text-gray-400 flex-shrink-0" />
              <a href={`tel:${contact.phone}`} className="text-gray-900 dark:text-white">{contact.phone}</a>
            </div>
          )}
          {contact.company && (
            <div className="flex items-center gap-3 text-sm">
              <Building2 size={16} className="text-gray-400 flex-shrink-0" />
              <span className="text-gray-900 dark:text-white">{contact.company}</span>
            </div>
          )}
          {contact.notes && (
            <div className="flex items-start gap-3 text-sm">
              <FileText size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}
        </div>

        {contact.tags.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Tags</p>
            <div className="flex flex-wrap gap-1">
              {contact.tags.map(t => <TagBadge key={t.id} tag={t} />)}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-400 dark:text-gray-500">
          Added {formatDate(contact.created_at)} · Updated {formatDate(contact.updated_at)}
        </div>

        <Button onClick={onEdit} variant="secondary" className="w-full gap-2">
          <Pencil size={14} />
          Edit contact
        </Button>
      </div>
    </Drawer>
  );
}
