import React, { useState, useCallback } from 'react';
import { useContacts } from '../hooks/useContacts';
import { ContactsTable } from '../components/contacts/ContactsTable';
import { ContactCard } from '../components/contacts/ContactCard';
import { ContactForm } from '../components/contacts/ContactForm';
import { ContactDetail } from '../components/contacts/ContactDetail';
import { DeleteConfirm } from '../components/contacts/DeleteConfirm';
import { SearchBar } from '../components/contacts/SearchBar';
import { TagFilter } from '../components/contacts/TagFilter';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { CsvImport } from '../components/csv/CsvImport';
import { CsvExport } from '../components/csv/CsvExport';
import { Button } from '../components/ui/Button';
import { Contact } from '../types';
import { Plus, Users } from 'lucide-react';

export function ContactsPage() {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContactState] = useState<Contact | null>(null);

  const { data, isLoading, isFetching } = useContacts({ q, tag, page, limit: 25 });

  const contacts = data?.data ?? [];
  const pagination = data?.pagination;

  const handleSearch = useCallback((value: string) => {
    setQ(value);
    setPage(1);
  }, []);

  const handleTagFilter = useCallback((value: string) => {
    setTag(value);
    setPage(1);
  }, []);

  function openCreate() {
    setEditContact(null);
    setFormOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditContact(contact);
    setFormOpen(true);
    setDetailOpen(false);
  }

  function openView(contact: Contact) {
    setSelectedContact(contact);
    setDetailOpen(true);
  }

  function openDelete(contact: Contact) {
    setDeleteContactState(contact);
    setDeleteOpen(true);
  }

  const loading = isLoading || isFetching;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-gray-400" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Contacts</h1>
            {pagination && (
              <span className="text-sm text-gray-400">({pagination.total.toLocaleString()})</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CsvImport />
            <CsvExport />
            <Button onClick={openCreate} size="sm">
              <Plus size={14} />
              Add contact
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <SearchBar onSearch={handleSearch} />
          <TagFilter selectedTag={tag} onTagChange={handleTagFilter} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {contacts.length === 0 && !loading ? (
          <EmptyState
            title={q || tag ? 'No contacts match your search' : 'No contacts yet'}
            description={q || tag ? 'Try different search terms or clear filters.' : 'Add your first contact or import from CSV.'}
            action={!q && !tag ? <Button onClick={openCreate}><Plus size={14} />Add contact</Button> : undefined}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block h-full overflow-y-auto">
              <ContactsTable
                contacts={contacts}
                loading={loading}
                onEdit={openEdit}
                onDelete={openDelete}
                onView={openView}
              />
            </div>
            {/* Mobile cards */}
            <div className="md:hidden h-full overflow-y-auto">
              <ContactCard
                contacts={contacts}
                loading={loading}
                onEdit={openEdit}
                onDelete={openDelete}
                onView={openView}
              />
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
      )}

      {/* Modals / Drawers */}
      <ContactForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        contact={editContact}
        onDelete={editContact ? () => { setFormOpen(false); openDelete(editContact); } : undefined}
      />
      <ContactDetail
        contact={selectedContact}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEdit={() => selectedContact && openEdit(selectedContact)}
      />
      <DeleteConfirm
        contact={deleteContact}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
