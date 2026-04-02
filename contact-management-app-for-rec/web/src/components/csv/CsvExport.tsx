import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Download } from 'lucide-react';
import { exportContacts } from '../../api/contacts';
import toast from 'react-hot-toast';

export function CsvExport() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      await exportContacts();
      toast.success('Export started');
    } catch {
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} loading={loading}>
      <Download size={14} />
      Export CSV
    </Button>
  );
}
