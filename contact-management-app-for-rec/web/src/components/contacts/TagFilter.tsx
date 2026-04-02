import React from 'react';
import { useTags } from '../../hooks/useTags';
import { Filter } from 'lucide-react';

interface TagFilterProps {
  selectedTag: string;
  onTagChange: (tag: string) => void;
}

export function TagFilter({ selectedTag, onTagChange }: TagFilterProps) {
  const { data: tags = [] } = useTags();

  return (
    <div className="relative flex items-center gap-2">
      <Filter size={16} className="text-gray-400" />
      <select
        value={selectedTag}
        onChange={e => onTagChange(e.target.value)}
        className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Filter by tag"
      >
        <option value="">All tags</option>
        {tags.map(t => (
          <option key={t.id} value={t.name}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}
