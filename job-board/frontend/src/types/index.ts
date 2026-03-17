export type Role = 'applicant' | 'employer' | 'admin'

export interface User {
  id: number
  email: string
  name: string
  role: Role
}

export interface Job {
  id: number
  employer_id: number
  employer_name?: string
  title: string
  description: string
  location?: string
  job_type: string
  salary_range?: string
  status: 'open' | 'closed' | 'draft'
  created_at: string
}

export interface Application {
  id: number
  applicant_id: number
  job_id: number
  job_title?: string
  applicant_name?: string
  applicant_email?: string
  cover_letter?: string
  status: 'pending' | 'reviewing' | 'accepted' | 'rejected'
  location?: string
  job_type?: string
  created_at: string
}
