import React, { useState, useEffect } from 'react';
import { Contact, CreateContactData } from '../../types';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TagMultiSelect } from '../tags/TagMultiSelect';
import { useCreateContact, useUpdateContact } from '../../hooks/useContacts';

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  contact?: Contact | null;
  onDelete?: () => void;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
  tagIds: string[];
}

const empty: FormState = { name: '', email: '', phone: '', company: '', notes: '', tagIds: [] };

export function ContactForm({ open, onClose, contact, onDelete }: ContactFormProps) {
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Partial<FormState>>({});

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();

  useEffect(() => {
    if (contact) {
      setForm({
        name: contact.name,
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        notes: contact.notes || '',
        tagIds: contact.tags.map(t => t.id),
      });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [contact, open]);

  function validate(): boolean {
    const errs: Partial<FormState> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email format';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const data: CreateContactData = {
      name: form.name.trim(),
      email: form.email || undefined,
      phone: form.phone || undefined,
      company: form.company || undefined,
      notes: form.notes || undefined,
      tagIds: form.tagIds,
    };

    if (contact) {
      await updateContact.mutateAsync({ id: contact.id, data });
    } else {
      await createContact.mutateAsync(data);
    }
    onClose();
  }

  const loading = createContact.isPending || updateContact.isPending;

  return (
    <Drawer open={open} onClose={onClose} title={contact ? 'Edit Contact' : 'Add Contact'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Name *"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          error={errors.name}
          placeholder="Jane Smith"
          autoFocus
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          error={errors.email}
          placeholder="jane@example.com"
        />
        <Input
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          placeholder="+44 7911 123456"
        />
        <Input
          label="Company"
          value={form.company}
          onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
          placeholder="Acme Corp"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Any notes about this contact..."
            className="rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <TagMultiSelect selectedIds={form.tagIds} onChange={ids => setForm(f => ({ ...f, tagIds: ids }))} />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading} className="flex-1">
            {contact ? 'Save changes' : 'Add contact'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
        {contact && onDelete && (
          <Button type="button" variant="danger" onClick={onDelete} className="w-full">
            Delete contact
          </Button>
        )}
      </form>
    </Drawer>
  );
}
