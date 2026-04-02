export interface User {
  id: string;
  email: string;
  name: string;
  created_at: Date;
}

export interface Tag {
  id: string;
  name: string;
  colour: string;
  is_system: boolean;
  created_at: Date;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
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
  error: string | null;
  pagination?: Pagination;
}

export interface ContactsQuery {
  q?: string;
  tag?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'company' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateContactBody {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  tagIds?: string[];
}

export interface UpdateContactBody {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  tagIds?: string[];
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface CreateTagBody {
  name: string;
  colour?: string;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      token?: string;
    }
  }
}
