import React, { useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Upload, AlertCircle } from 'lucide-react';
import { useImportContacts } from '../../hooks/useContacts';
import { CsvImportResult } from '../../types';

export function CsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const importContacts = useImportContacts();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await importContacts.mutateAsync(file);
    setResult(res);
    setShowResult(true);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="hidden"
        aria-label="Import CSV file"
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => fileRef.current?.click()}
        loading={importContacts.isPending}
      >
        <Upload size={14} />
        Import CSV
      </Button>

      <Modal open={showResult} onClose={() => setShowResult(false)} title="Import Results" size="md">
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">Imported</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">Skipped</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-1">Errors</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <AlertCircle size={14} className="text-red-500" />
                  Error details
                </p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  {result.errors.map((err, i) => (
                    <div key={i} className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-b last:border-b-0 border-gray-100 dark:border-gray-800">
                      Row {err.row}: {err.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={() => setShowResult(false)} className="w-full">Done</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
