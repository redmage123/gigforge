export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  tenant_id: string;
}

export interface Tag {
  id: string;
  tenant_id: string;
  name: string;
  color?: string;
  created_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  company_id?: string;
  source?: string;
  status: string;
  custom_fields?: Record<string, unknown>;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface Company {
  id: string;
  tenant_id: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Stage {
  id: string;
  name: string;
  order: number;
  stage_type: string;
  probability_pct: number;
  color?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  stages: Stage[];
}

export interface Deal {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id: string;
  value?: number;
  currency: string;
  contact_id?: string;
  company_id?: string;
  assigned_to?: string;
  probability: number;
  expected_close?: string;
  notes?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  type: string;
  subject: string;
  description?: string;
  contact_id?: string;
  deal_id?: string;
  company_id?: string;
  scheduled_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigned_to?: string;
  contact_id?: string;
  deal_id?: string;
  due_date?: string;
  priority: string;
  status: string;
  created_at: string;
}

export interface KPIData {
  total_deals: number;
  pipeline_value: number;
  won_value: number;
  conversion_rate: number;
  weighted_pipeline_value: number;
  avg_deal_size: number;
  open_tasks_count: number;
  contacts_added_this_week: number;
  deals_by_stage: Array<{ stage_name: string; count: number; value: number }>;
  recent_activities: Activity[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}
