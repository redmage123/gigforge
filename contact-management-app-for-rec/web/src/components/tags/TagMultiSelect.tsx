import React, { useState, useRef, useEffect } from 'react';
import { Tag } from '../../types';
import { TagBadge } from './TagBadge';
import { useTags, useCreateTag } from '../../hooks/useTags';
import { Plus, ChevronDown } from 'lucide-react';

interface TagMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TagMultiSelect({ selectedIds, onChange }: TagMultiSelectProps) {
  const { data: allTags = [] } = useTags();
  const createTag = useCreateTag();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTags = allTags.filter(t => selectedIds.includes(t.id));
  const filteredTags = allTags.filter(
    t => t.name.toLowerCase().includes(search.toLowerCase()) && !selectedIds.includes(t.id)
  );
  const canCreate = search.trim() && !allTags.some(t => t.name.toLowerCase() === search.trim().toLowerCase());

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
  }

  async function handleCreate() {
    if (!search.trim()) return;
    const tag = await createTag.mutateAsync({ name: search.trim() });
    onChange([...selectedIds, tag.id]);
    setSearch('');
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Tags</label>
      <div
        onClick={() => setOpen(o => !o)}
        className="flex flex-wrap gap-1 items-center min-h-[38px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 cursor-pointer"
      >
        {selectedTags.map(t => (
          <TagBadge
            key={t.id}
            tag={t}
            onRemove={() => toggle(t.id)}
          />
        ))}
        {selectedTags.length === 0 && (
          <span className="text-gray-400 dark:text-gray-500 text-sm">Select tags...</span>
        )}
        <ChevronDown size={14} className="ml-auto text-gray-400" />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tags..."
              className="w-full text-sm px-2 py-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
              onClick={e => e.stopPropagation()}
            />
          </div>
          {filteredTags.map(t => (
            <button
              key={t.id}
              onClick={() => { toggle(t.id); setSearch(''); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: t.colour }}
              />
              <span className="text-sm text-gray-900 dark:text-gray-100">{t.name}</span>
            </button>
          ))}
          {canCreate && (
            <button
              onClick={handleCreate}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left text-blue-600 dark:text-blue-400"
            >
              <Plus size={14} />
              <span className="text-sm">Create "{search.trim()}"</span>
            </button>
          )}
          {filteredTags.length === 0 && !canCreate && (
            <p className="px-3 py-2 text-sm text-gray-400">No tags found</p>
          )}
        </div>
      )}
    </div>
  );
}
