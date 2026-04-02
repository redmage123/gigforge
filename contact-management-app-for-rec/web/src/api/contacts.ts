import apiClient from './client';
import { ApiResponse, Contact, ContactsParams, CreateContactData, UpdateContactData, CsvImportResult } from '../types';

export async function getContacts(params: ContactsParams): Promise<ApiResponse<Contact[]>> {
  const res = await apiClient.get<ApiResponse<Contact[]>>('/contacts', { params });
  return res.data;
}

export async function getContact(id: string): Promise<Contact> {
  const res = await apiClient.get<ApiResponse<Contact>>(`/contacts/${id}`);
  return res.data.data!;
}

export async function createContact(data: CreateContactData): Promise<Contact> {
  const res = await apiClient.post<ApiResponse<Contact>>('/contacts', data);
  return res.data.data!;
}

export async function updateContact(id: string, data: UpdateContactData): Promise<Contact> {
  const res = await apiClient.put<ApiResponse<Contact>>(`/contacts/${id}`, data);
  return res.data.data!;
}

export async function deleteContact(id: string): Promise<void> {
  await apiClient.delete(`/contacts/${id}`);
}

export async function importContacts(file: File): Promise<CsvImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post<ApiResponse<CsvImportResult>>('/contacts/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data!;
}

export async function exportContacts(): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/v1/contacts/export', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contacts.csv';
  a.click();
  URL.revokeObjectURL(url);
}
