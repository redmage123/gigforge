import React from 'react';
import { Contact } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useDeleteContact } from '../../hooks/useContacts';

interface DeleteConfirmProps {
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
}

export function DeleteConfirm({ contact, open, onClose }: DeleteConfirmProps) {
  const deleteContact = useDeleteContact();

  async function handleDelete() {
    if (!contact) return;
    await deleteContact.mutateAsync(contact.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete contact" size="sm">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Are you sure you want to delete <strong className="text-gray-900 dark:text-white">{contact?.name}</strong>?
        This action cannot be undone.
      </p>
      <div className="flex gap-3">
        <Button variant="danger" onClick={handleDelete} loading={deleteContact.isPending} className="flex-1">
          Delete
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
