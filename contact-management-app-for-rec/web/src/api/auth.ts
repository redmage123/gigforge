import apiClient from './client';
import { ApiResponse, User } from '../types';

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await apiClient.post<ApiResponse<{ token: string; user: User }>>('/auth/login', { email, password });
  return res.data.data!;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}
