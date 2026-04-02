export interface Tag {
  id: string;
  name: string;
  colour: string;
  is_system: boolean;
  created_at?: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T> {
  data: T | null;
  error?: string | null;
  pagination?: Pagination;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface ContactsParams {
  q?: string;
  tag?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'company' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateContactData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  tagIds?: string[];
}

export interface UpdateContactData extends Partial<CreateContactData> {}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}
